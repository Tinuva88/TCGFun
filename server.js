// tcg-editor-backend/server.js

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const multer = require('multer');
const fs = require('fs'); // File System module, to read the uploaded file
const csv = require('csv-parser'); // CSV parsing library
const { Readable } = require('stream'); // To stream from buffer if using memoryStorage

const db = require('./database.js');

// Configure multer for temporary file storage
// const upload = multer({ dest: 'uploads/' }); // Simple destination
// For in-memory storage if files are small (be cautious with large files)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Hello from the TCG Editor Backend! SQLite is connected and CORS is enabled.');
});

// --- API Endpoint for CSV Card Import ---
app.post('/api/sets/:setId/cards/import-csv', upload.single('cardCsvFile'), async (req, res) => {
    const setId = req.params.setId;
    const importSummary = {
        processedRows: 0,
        dbOperationsSuccessful: 0, // Counts both inserts and updates
        // createdCount: 0, // Could add these if specific counts are needed, but harder with basic upsert
        // updatedCount: 0,
        failedRowsInDataValidation: 0,
        dbInsertErrors: 0, // Rows that failed at the DB level during upsert attempt
        errors: [],
        startTime: Date.now()
    };

    if (!req.file) {
        return res.status(400).json({ error: "No CSV file uploaded." });
    }

    console.log("SERVER_LOG: Received CSV card import request for setId:", setId);

    try {
        // 1. Verify the set exists
        await new Promise((resolve, reject) => {
            db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (err, row) => {
                if (err) return reject(new Error("Database error verifying set existence."));
                if (!row) return reject(new Error(`Set with id '${setId}' not found for card import.`));
                resolve(row);
            });
        });
        console.log("SERVER_LOG: Set verified:", setId);

        // 2. Fetch existing rarities for the set to map extRarity
        const setRaritiesMap = await new Promise((resolve, reject) => {
            db.all("SELECT id FROM rarities WHERE set_id = ?", [setId], (err, rows) => {
                if (err) return reject(new Error("Could not fetch rarities for the set."));
                const map = new Map();
                (rows || []).forEach(r => map.set(String(r.id).toUpperCase(), r.id));
                resolve(map);
            });
        });
        console.log("SERVER_LOG: Fetched rarities for set. Map size:", setRaritiesMap.size);

        const cardsForDbProcessing = [];
        const fileContent = req.file.buffer.toString('utf8');
        const readableStream = Readable.from(fileContent);

        await new Promise((resolveStream, rejectStream) => {
            readableStream
                .pipe(csv({ mapHeaders: ({ header }) => header.trim() }))
                .on('data', (row) => {
                    importSummary.processedRows++;
                    let cardData = {};
                    let rowErrors = [];

                    const getVal = (headerName) => {
                        const key = Object.keys(row).find(k => k.toLowerCase() === headerName.toLowerCase());
                        return key ? row[key] : undefined;
                    };

                    cardData.id = getVal('productId');
                    cardData.name = getVal('name');
                    cardData.image_url = getVal('imageUrl') || null;
                    const marketPriceStr = getVal('marketPrice');
                    cardData.card_number = getVal('extNumber') || cardData.id;
                    const extRarityStr = getVal('extRarity');

                    if (!cardData.id || String(cardData.id).trim() === "") rowErrors.push(`Row ${importSummary.processedRows}: Missing or empty productId (card ID).`);
                    if (!cardData.name || String(cardData.name).trim() === "") rowErrors.push(`Row ${importSummary.processedRows}: Missing or empty name.`);
                    
                    cardData.market_price = parseFloat(marketPriceStr);
                    if (marketPriceStr !== undefined && marketPriceStr !== '' && isNaN(cardData.market_price)) {
                        rowErrors.push(`Row ${importSummary.processedRows} (ID: ${cardData.id || 'N/A'}): Market Price ('${marketPriceStr}') is not a valid number.`);
                    } else if (marketPriceStr === undefined || marketPriceStr === '') {
                        cardData.market_price = 0.0;
                    }

                    if (!extRarityStr || String(extRarityStr).trim() === "") {
                        rowErrors.push(`Row ${importSummary.processedRows} (ID: ${cardData.id || 'N/A'}): Missing extRarity.`);
                    } else {
                        const matchedRarityId = setRaritiesMap.get(String(extRarityStr).trim().toUpperCase());
                        if (!matchedRarityId) {
                            rowErrors.push(`Row ${importSummary.processedRows} (ID: ${cardData.id || 'N/A'}): Rarity '${extRarityStr}' not found in set '${setId}'. Defined rarities (uppercase): ${Array.from(setRaritiesMap.keys()).join(', ')}`);
                        } else {
                            cardData.rarity_id = matchedRarityId;
                        }
                    }

                    if (rowErrors.length > 0) {
                        importSummary.errors.push(...rowErrors);
                        importSummary.failedRowsInDataValidation++;
                    } else {
                        cardsForDbProcessing.push([
                            String(cardData.id).trim(), String(cardData.name).trim(), cardData.image_url,
                            cardData.market_price, String(cardData.card_number).trim(), setId, String(cardData.rarity_id).trim()
                        ]);
                    }
                })
                .on('end', resolveStream)
                .on('error', rejectStream);
        });

        console.log(`SERVER_LOG: CSV parsing complete. Rows processed: ${importSummary.processedRows}. Rows initially failing validation: ${importSummary.failedRowsInDataValidation}. Rows to attempt DB upsert: ${cardsForDbProcessing.length}`);

        if (cardsForDbProcessing.length > 0) {
            await new Promise((resolve, reject) => {
                db.serialize(async () => {
                    db.run("BEGIN TRANSACTION", async (beginErr) => {
                        if (beginErr) {
                            return reject(new Error("Failed to begin transaction: " + beginErr.message));
                        }

                        // UPSERT SQL Statement
                        const stmt = db.prepare(`
                            INSERT INTO cards (id, name, image_url, market_price, card_number, set_id, rarity_id)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(id, set_id) DO UPDATE SET
                                name = excluded.name,
                                image_url = excluded.image_url,
                                market_price = excluded.market_price,
                                card_number = excluded.card_number,
                                rarity_id = excluded.rarity_id
                                -- Add updated_at = CURRENT_TIMESTAMP if you have such a column
                        `);
                        
                        let allOpsSuccessful = true;
                        let firstSpecificDbError = null;

                        for (const params of cardsForDbProcessing) {
                            try {
                                await new Promise((resolveRow, rejectRow) => {
                                    stmt.run(params, function(err) {
                                        if (err) {
                                            const rowErrorMsg = `Card ID '${params[0]}' (Name: '${params[1]}'): SQLite Upsert Error - ${err.message}`;
                                            console.error("!!! SERVER_LOG: Specific DB Upsert Error:", rowErrorMsg);
                                            importSummary.errors.push(rowErrorMsg);
                                            if (!firstSpecificDbError) {
                                                firstSpecificDbError = new Error(rowErrorMsg);
                                            }
                                            return rejectRow(err);
                                        }
                                        if (this.changes > 0) { // An insert or an update occurred
                                            importSummary.dbOperationsSuccessful++;
                                        }
                                        resolveRow();
                                    });
                                });
                            } catch (dbRowError) {
                                allOpsSuccessful = false;
                                importSummary.dbInsertErrors++;
                                console.log(`SERVER_LOG: DB upsert failed for card ID ${params[0]}, stopping further DB operations for this batch.`);
                                break; 
                            }
                        }

                        stmt.finalize(async (finalizeErr) => {
                            if (finalizeErr) {
                                allOpsSuccessful = false;
                                if (!firstSpecificDbError) firstSpecificDbError = finalizeErr;
                                const finalizeErrorMsg = "DB statement finalization error: " + finalizeErr.message;
                                console.error("!!! SERVER_LOG: Specific DB Finalize Error:", finalizeErrorMsg);
                                importSummary.errors.push(finalizeErrorMsg);
                                importSummary.dbInsertErrors++;
                            }

                            if (allOpsSuccessful) {
                                db.run("COMMIT", (commitErr) => {
                                    if (commitErr) {
                                        console.error("!!! SERVER_LOG: DB Commit Error:", commitErr.message);
                                        db.run("ROLLBACK", () => {});
                                        return reject(new Error("Failed to commit transaction: " + commitErr.message));
                                    }
                                    console.log("SERVER_LOG: Transaction Committed Successfully. DB Operations Successful:", importSummary.dbOperationsSuccessful);
                                    resolve();
                                });
                            } else {
                                db.run("ROLLBACK", () => {
                                    const detail = firstSpecificDbError ? firstSpecificDbError.message : "Unknown DB error during batch upsert/finalize.";
                                    console.error(`!!! SERVER_LOG: DB Rollback. First specific error causing rollback: ${detail}`);
                                    importSummary.dbOperationsSuccessful = 0; // None were committed
                                    return reject(new Error(`Import failed due to database errors during upsert. Transaction rolled back. First error: ${detail}`));
                                });
                            }
                        });
                    });
                });
            });
        } else if (importSummary.processedRows > 0 && importSummary.failedRowsInDataValidation === importSummary.processedRows) {
            console.log("SERVER_LOG: All rows failed initial validation. No DB operations performed.");
        } else if (importSummary.processedRows === 0) {
            console.log("SERVER_LOG: CSV was empty or contained no data rows.");
            importSummary.errors.push("CSV file was empty or contained no data rows to process.");
        }

        importSummary.duration = (Date.now() - importSummary.startTime) / 1000.0; // Duration in seconds
        importSummary.failedCount = importSummary.failedRowsInDataValidation + importSummary.dbInsertErrors;
        
        const overallStatus = importSummary.dbOperationsSuccessful > 0 ? (importSummary.failedCount > 0 ? 207 : 200) : 400;
        return res.status(overallStatus).json(importSummary);

    } catch (error) { // Catch errors from set verification, rarity fetching, or unhandled promise rejections
        console.error("SERVER_LOG: Critical error during CSV import process (outer catch):", error.message);
        importSummary.errors.push(error.message || "An unexpected critical error occurred during import.");
        // Adjust failedCount to reflect total processed if this outer catch is hit
        importSummary.failedCount = importSummary.processedRows - importSummary.dbOperationsSuccessful; 
        importSummary.duration = (Date.now() - importSummary.startTime) / 1000.0;
        db.run("ROLLBACK", () => {}); // Attempt rollback just in case
        return res.status(500).json(importSummary);
    }

    // Fetch existing rarities for the set to map extRarity
    const setRarities = await new Promise((resolve, reject) => {
        db.all("SELECT id FROM rarities WHERE set_id = ?", [setId], (err, rows) => {
            if (err) reject(new Error("Could not fetch rarities for the set."));
            else resolve(rows.map(r => r.id)); // Array of rarity IDs like ["C", "SR", "L"]
        });
    }).catch(err => {
        console.error(err.message);
        return res.status(500).json({ error: err.message });
    });

    if (!setRarities) return; // Exit if rarities couldn't be fetched

    // Use a temporary file path if multer saves to disk, or buffer if in memory
    const processStream = fs.createReadStream(req.file.path) // If using 'uploads/' destination
    // If using multer.memoryStorage():
    // const readableStream = require('stream').Readable.from(req.file.buffer.toString());
    // const processStream = readableStream;


    // For multer.memoryStorage()
    const fileContent = req.file.buffer.toString('utf8');

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const sql = `INSERT INTO cards (id, name, image_url, market_price, card_number, set_id, rarity_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const stmt = db.prepare(sql);
        let rowIndex = 0;

        const rowsToProcess = [];
        require('stream').Readable.from(fileContent)
            .pipe(csv())
            .on('data', (data) => {
                rowIndex++;
                // --- Map CSV columns to our database fields ---
                // All column names from CSV are keys in 'data' object
                const cardId = data.productId; // Assuming CSV has 'productId'
                const cardName = data.name;
                const imageUrl = data.imageUrl || null;
                const marketPrice = parseFloat(data.marketPrice);
                const extNumber = data.extNumber;
                const extRarity = data.extRarity; // e.g., "C", "SR"

                let currentErrors = [];

                if (!cardId || cardId.trim() === "") {
                    currentErrors.push(`Row ${rowIndex}: Missing ProductID (card ID).`);
                }
                if (!cardName || cardName.trim() === "") {
                    currentErrors.push(`Row ${rowIndex}: Missing Name.`);
                }
                if (isNaN(marketPrice)) { // marketPrice can be 0, but not non-numeric
                    currentErrors.push(`Row <span class="math-inline">\{rowIndex\}\: Market Price \('</span>{data.marketPrice}') is not a valid number.`);
                }
                if (!extRarity || !setRarities.includes(extRarity.trim())) {
                    currentErrors.push(`Row <span class="math-inline">\{rowIndex\}\: Rarity ID '</span>{extRarity}' not found in this set's defined rarities. Available: ${setRarities.join(', ')}`);
                }

                if (currentErrors.length > 0) {
                    errors.push(...currentErrors);
                    failedCount++;
                    return; // Skip this row for insertion
                }

                const cardNumber = (extNumber && extNumber.trim() !== '') ? extNumber.trim() : cardId; // Default card_number to id

                rowsToProcess.push([
                    cardId.trim(), cardName.trim(), imageUrl, marketPrice, cardNumber, setId, extRarity.trim()
                ]);
            })
            .on('end', async () => {
                // Now insert all valid rows
                let allInsertsSuccessful = true;
                for (const params of rowsToProcess) {
                    try {
                        await new Promise((resolve, reject) => {
                            stmt.run(params, function(err) {
                                if (err) {
                                    errors.push(`Row (ID: ${params[0]}): DB Error - ${err.message}`);
                                    failedCount++;
                                    successfullyImportedCount = rowsToProcess.length - failedCount; // Adjust count
                                    return reject(err); // Stop further inserts in this batch on first DB error
                                }
                                resolve();
                            });
                        });
                    } catch (dbError) {
                        allInsertsSuccessful = false;
                        break; // Stop processing if a DB error occurs
                    }
                }
                stmt.finalize();

                if (allInsertsSuccessful && failedCount === 0) {
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) {
                            db.run("ROLLBACK");
                            res.status(500).json({ error: "Failed to commit transaction.", details: commitErr.message });
                        } else {
                            res.json({
                                message: "CSV processed successfully.",
                                imported: rowsToProcess.length,
                                failed: failedCount,
                                errors: errors
                            });
                        }
                    });
                } else {
                    db.run("ROLLBACK", () => {
                        res.status(400).json({
                            message: "CSV processed with errors. No cards were imported.",
                            imported: 0, // Since we rolled back
                            failed: rowsToProcess.length + failedCount - (rowsToProcess.length - failedCount), // total rows - successful before error + earlier non-DB errors
                            errors: errors
                        });
                    });
                }

                // If multer saved to disk: Clean up the uploaded file
                if (req.file && req.file.path) {
                    fs.unlink(req.file.path, (unlinkErr) => {
                        if (unlinkErr) console.error("Error deleting temp CSV file:", unlinkErr);
                    });
                }
            })
            .on('error', (streamError) => { // Handle errors from the stream/csv-parser itself
                console.error("Error processing CSV stream:", streamError);
                db.run("ROLLBACK"); // Ensure rollback if stream fails mid-transaction
                if (req.file && req.file.path) fs.unlinkSync(req.file.path); // Attempt cleanup
                res.status(500).json({ error: "Failed to process CSV file.", details: streamError.message });
            });
    }); // end db.serialize
}); // end app.post

// --- API Endpoints for Guarantee Templates ---
app.get('/api/guarantee-templates', (req, res) => {
    const scope = req.query.scope;
    let sql;
    let params = [];

    if (scope && (scope === 'box' || scope === 'case')) {
        sql = "SELECT id, name, description, scope FROM guarantee_templates WHERE scope = ? ORDER BY name";
        params.push(scope);
    } else if (!scope || scope === "") { // Handle empty scope to mean all
        sql = "SELECT id, name, description, scope FROM guarantee_templates ORDER BY name";
        // No params needed
    } else { // Invalid scope value
        return res.status(400).json({ "error": "If provided, 'scope' query parameter must be 'box' or 'case'." });
    }

    db.all(sql, params, (err, rows) => {
        // ... (rest of the error handling and response) ...
        if (err) {
            console.error(`Error fetching guarantee templates (scope: ${scope || 'all'}):`, err.message);
            return res.status(500).json({ "error": `Could not retrieve guarantee templates.` });
        }
        res.json({ "message": "success", "data": rows });
    });
});

// GET a specific template with its rules
app.get('/api/guarantee-templates/:templateId', (req, res) => {
    const templateId = parseInt(req.params.templateId);
    if (isNaN(templateId)) {
        return res.status(400).json({ "error": "Invalid template ID." });
    }

    let templateData = {};

    db.get("SELECT id, name, description, scope FROM guarantee_templates WHERE id = ?", [templateId], (err, templateRow) => {
        if (err) {
            console.error(`Error fetching guarantee template ${templateId}:`, err.message);
            return res.status(500).json({ "error": "Could not retrieve template details." });
        }
        if (!templateRow) {
            return res.status(404).json({ "error": `Guarantee template with id ${templateId} not found.` });
        }
        templateData = templateRow;
        templateData.rules = []; // Initialize rules array

        const rulesSql = "SELECT rule_json, sort_order FROM guarantee_template_rules WHERE template_id = ? ORDER BY sort_order, id";
        db.all(rulesSql, [templateId], (rulesErr, ruleRows) => {
            if (rulesErr) {
                console.error(`Error fetching rules for template ${templateId}:`, rulesErr.message);
                templateData.rules_error = "Could not retrieve rules.";
                return res.status(500).json({ "message": "success_partial", "data": templateData, "error": "Could not retrieve all rule details." });
            }
            try {
                templateData.rules = ruleRows.map(r => JSON.parse(r.rule_json));
                res.json({ "message": "success", "data": templateData });
            } catch (parseError) {
                console.error(`Error parsing rule_json for template ${templateId}:`, parseError.message);
                templateData.rules_error = "Error parsing stored rules.";
                res.status(500).json({ "message": "success_partial", "data": templateData, "error": "Error parsing stored rule details." });
            }
        });
    });
});

// POST - Create a new guarantee template with its rules
app.post('/api/guarantee-templates', (req, res) => {
    const { name, description, scope, rules } = req.body; // rules is an array of rule objects

    if (!name || !scope || (scope !== 'box' && scope !== 'case')) {
        return res.status(400).json({ "error": "Template name and a valid scope ('box' or 'case') are required." });
    }
    if (rules && !Array.isArray(rules)) {
        return res.status(400).json({ "error": "'rules' must be an array." });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        const templateSql = `INSERT INTO guarantee_templates (name, description, scope) VALUES (?, ?, ?)`;
        db.run(templateSql, [name, description || null, scope], function(err) {
            if (err) {
                db.run("ROLLBACK", () => {}); // Attempt rollback
                if (err.message.includes("UNIQUE constraint failed")) {
                    return res.status(409).json({ "error": `A template with the name '${name}' already exists.` });
                }
                console.error("Error inserting guarantee template:", err.message);
                return res.status(500).json({ "error": "Failed to create template." });
            }
            const templateId = this.lastID;
            let rulesProcessedSuccessfully = true;
            let ruleProcessingError = null;


            if (rules && rules.length > 0) {
                const ruleStmt = db.prepare("INSERT INTO guarantee_template_rules (template_id, rule_json, sort_order) VALUES (?, ?, ?)");
                for (let i = 0; i < rules.length; i++) {
                    const rule = rules[i];
                    try {
                        // Synchronous part of the loop, db.run callback is async
                        ruleStmt.run(templateId, JSON.stringify(rule), i, (ruleErr) => {
                            if (ruleErr) {
                                console.error("Error inserting template rule (async callback):", ruleErr.message);
                                rulesProcessedSuccessfully = false; // Mark failure
                                ruleProcessingError = ruleErr; // Store the error
                            }
                        });
                        if (!rulesProcessedSuccessfully) break; // Exit loop if an error occurred in a previous iteration's callback
                    } catch (jsonErr) {
                         console.error("Error stringifying rule for template (sync):", jsonErr.message);
                         rulesProcessedSuccessfully = false;
                         ruleProcessingError = jsonErr;
                         break; // Exit loop
                    }
                }
                // Finalize might need to be handled carefully if errors occurred in callbacks
                ruleStmt.finalize((finalizeErr) => {
                    if (finalizeErr && rulesProcessedSuccessfully) { // Only log finalizeErr if other things were fine
                        console.error("Error finalizing rule statement:", finalizeErr.message);
                        rulesProcessedSuccessfully = false;
                        ruleProcessingError = finalizeErr;
                    }

                    if (!rulesProcessedSuccessfully) {
                        db.run("ROLLBACK", () => {});
                        return res.status(500).json({ "error": "Failed to save all template rules. " + (ruleProcessingError ? ruleProcessingError.message : "") });
                    }

                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) { db.run("ROLLBACK", () => {}); return res.status(500).json({ "error": "Failed to commit transaction." }); }
                        fetchFullTemplate(templateId, res, 201);
                    });
                });
            } else { // No rules to add
                db.run("COMMIT", (commitErr) => {
                    if (commitErr) { db.run("ROLLBACK", () => {}); return res.status(500).json({ "error": "Failed to commit transaction." }); }
                    fetchFullTemplate(templateId, res, 201);
                });
            }
        });
    });
});

// PUT - Update an existing guarantee template (details and/or rules)
app.put('/api/guarantee-templates/:templateId', (req, res) => {
    const templateId = parseInt(req.params.templateId);
    const { name, description, scope, rules } = req.body;

    if (isNaN(templateId)) {
        return res.status(400).json({ "error": "Invalid template ID." });
    }
    if (name === undefined && description === undefined && rules === undefined && scope === undefined) {
        return res.status(400).json({ "error": "No update data provided." });
    }
    if (scope && (scope !== 'box' && scope !== 'case')) {
        return res.status(400).json({ "error": "If provided, scope must be 'box' or 'case'." });
    }
    if (rules && !Array.isArray(rules)) {
        return res.status(400).json({ "error": "If provided, 'rules' must be an array." });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        const updateTemplateDetails = () => new Promise((resolve, reject) => {
            let updateParts = [];
            let updateValues = [];
            if (name !== undefined) { updateParts.push("name = ?"); updateValues.push(name); }
            if (description !== undefined) { updateParts.push("description = ?"); updateValues.push(description || null); }
            if (scope !== undefined) { updateParts.push("scope = ?"); updateValues.push(scope); }

            if (updateParts.length > 0) {
                updateValues.push(templateId);
                const templateSql = `UPDATE guarantee_templates SET ${updateParts.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
                db.run(templateSql, updateValues, function(err) {
                    if (err) {
                        if (err.message.includes("UNIQUE constraint failed")) {
                            return reject(new Error(`A template with the name '${name}' may already exist.`));
                        }
                        return reject(err);
                    }
                    if (this.changes === 0 && !rules) { // No changes and no rules to update either
                        // Check if template exists if only rules are being updated
                        db.get("SELECT id FROM guarantee_templates WHERE id = ?", [templateId], (e, r) => {
                            if(e) return reject(e);
                            if(!r) return reject(new Error("Template not found for update."));
                            resolve();
                        });
                        return;
                    }
                    resolve();
                });
            } else { // No details to update, but maybe rules are being updated
                 db.get("SELECT id FROM guarantee_templates WHERE id = ?", [templateId], (e, r) => {
                    if(e) return reject(e);
                    if(!r) return reject(new Error("Template not found for rule update."));
                    resolve();
                });
            }
        });

        const updateTemplateRules = () => new Promise(async (resolve, reject) => {
            if (rules !== undefined) { // If rules array is provided (even if empty, it means replace)
                try {
                    await new Promise((resDel, rejDel) => db.run("DELETE FROM guarantee_template_rules WHERE template_id = ?", [templateId], (err) => err ? rejDel(err) : resDel()));
                    if (rules.length > 0) {
                        const ruleStmt = db.prepare("INSERT INTO guarantee_template_rules (template_id, rule_json, sort_order) VALUES (?, ?, ?)");
                        for (let i = 0; i < rules.length; i++) {
                            await new Promise((resRule, rejRule) => {
                                try {
                                    ruleStmt.run(templateId, JSON.stringify(rules[i]), i, (err) => err ? rejRule(err) : resRule());
                                } catch (jsonErr) { rejRule(jsonErr); }
                            });
                        }
                        await new Promise((resFin, rejFin) => ruleStmt.finalize(err => err ? rejFin(err) : resFin()));
                    }
                    resolve();
                } catch (error) {
                    reject(error);
                }
            } else {
                resolve(); // No rules to update
            }
        });

        (async () => {
            try {
                await updateTemplateDetails();
                await updateTemplateRules();
                await new Promise((resolve, reject) => db.run("COMMIT", err => err ? reject(err) : resolve()));
                fetchFullTemplate(templateId, res, 200);
            } catch (error) {
                await new Promise(resolve => db.run("ROLLBACK", () => resolve()));
                console.error(`Error updating template ${templateId}:`, error.message);
                const statusCode = error.message.includes("UNIQUE constraint failed") ? 409 :
                                   error.message.includes("not found") ? 404 : 500;
                if (!res.headersSent) {
                    res.status(statusCode).json({ "error": error.message });
                }
            }
        })();
    });
});

// DELETE - Delete a guarantee template
app.delete('/api/guarantee-templates/:templateId', (req, res) => {
    const templateId = parseInt(req.params.templateId);
    if (isNaN(templateId)) {
        return res.status(400).json({ "error": "Invalid template ID." });
    }
    const sql = 'DELETE FROM guarantee_templates WHERE id = ?'; // ON DELETE CASCADE handles rules
    db.run(sql, [templateId], function (err) {
        if (err) {
            console.error(`Error deleting guarantee template ${templateId}:`, err.message);
            return res.status(500).json({ "error": "Failed to delete template." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ "error": `Guarantee template with id ${templateId} not found.` });
        }
        res.json({ "message": "success", "templateId": templateId, "changes": this.changes });
    });
});


app.get('/api/tcgs/:tcgId', (req, res) => {
    const sql = "SELECT * FROM tcgs WHERE id = ?";
    db.get(sql, [req.params.tcgId], (err, row) => {
        if (err) {
          console.error(`Error fetching TCG ${req.params.tcgId}:`, err.message);
          res.status(500).json({ "error": `Could not retrieve TCG ${req.params.tcgId}.` });
          return;
        }
        if (row) { res.json({ "message": "success", "data": row }); }
        else { res.status(404).json({ "error": `TCG with id ${req.params.tcgId} not found.` }); }
      });
});

app.post('/api/tcgs', (req, res) => {
    const errors = [];
    if (!req.body.id) { errors.push("No id specified for TCG"); }
    if (!req.body.name) { errors.push("No name specified for TCG"); }
    if (errors.length) { res.status(400).json({ "error": errors.join(", ") }); return; }

    const data = { id: req.body.id, name: req.body.name };
    const sql = 'INSERT INTO tcgs (id, name) VALUES (?, ?)';
    db.run(sql, [data.id, data.name], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE constraint failed")) {
                res.status(409).json({ "error": `TCG with id '${data.id}' already exists.`});
            } else {
                console.error("Error inserting TCG:", err.message);
                res.status(400).json({ "error": err.message });
            }
            return;
        }
        // Return the newly created TCG object
        db.get("SELECT * FROM tcgs WHERE id = ?", [data.id], (selectErr, row) => {
            if (selectErr) {
                console.error("Error fetching created TCG:", selectErr.message);
                // Still success as it was created, but client might want the object
                return res.status(201).json({ "message": "success (but error fetching created row)", "rowId": this.lastID });
            }
            res.status(201).json({ "message": "success", "data": row });
        });
    });
});

app.put('/api/tcgs/:tcgId', (req, res) => {
    const tcgId = req.params.tcgId;
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ "error": "Name is required for updating the TCG." });
    }

    const sql = 'UPDATE tcgs SET name = ? WHERE id = ?';
    db.run(sql, [name, tcgId], function (err) {
        if (err) {
            console.error(`Error updating TCG ${tcgId}:`, err.message);
            return res.status(500).json({ "error": "Could not update TCG in database." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ "error": `TCG with id '${tcgId}' not found.` });
        }
        // Fetch and return the updated TCG object
        db.get("SELECT * FROM tcgs WHERE id = ?", [tcgId], (selectErr, row) => {
            if (selectErr) {
                console.error("Error fetching updated TCG:", selectErr.message);
                // TCG was updated, but fetching it back failed
                return res.json({ "message": "success (update successful, but error fetching updated row)", "data": {id: tcgId, name: name} });
            }
            if (!row) { // Should not happen if this.changes > 0
                 return res.status(404).json({ "error": `Updated TCG with id '${tcgId}' could not be found.` });
            }
            res.json({ "message": "success", "data": row });
        });
    });
});

// --- API Endpoints for Card Sets ---
app.get('/api/tcgs/:tcgId/sets', (req, res) => {
    const tcgId = req.params.tcgId;
    db.get("SELECT id, name FROM tcgs WHERE id = ?", [tcgId], (err, tcgRow) => {
        if (err) { res.status(500).json({ "error": "Error verifying TCG existence." }); return; }
        if (!tcgRow) { res.status(404).json({ "error": `TCG with id '${tcgId}' not found.` }); return; }

        const sql = "SELECT * FROM card_sets WHERE tcg_id = ? ORDER BY name";
        db.all(sql, [tcgId], (err, rows) => {
            if (err) { res.status(500).json({ "error": `Could not retrieve sets for TCG ${tcgId}.` }); return; }
            res.json({ "message": "success", "tcg": tcgRow, "data": rows });
        });
    });
});

app.post('/api/tcgs/:tcgId/sets', (req, res) => {
    const tcgId = req.params.tcgId;
    const errors = [];
    if (!req.body.id) { errors.push("No id specified for set"); }
    if (!req.body.name) { errors.push("No name specified for set"); }
    if (errors.length) { res.status(400).json({ "error": errors.join(", ") }); return; }

    db.get("SELECT id FROM tcgs WHERE id = ?", [tcgId], (err, tcgRow) => {
        if (err) { res.status(500).json({ "error": "Error verifying TCG existence." }); return; }
        if (!tcgRow) { res.status(404).json({ "error": `TCG with id '${tcgId}' not found.` }); return; }

        const setData = { id: req.body.id, name: req.body.name, tcg_id: tcgId };
        const sql = 'INSERT INTO card_sets (id, name, tcg_id) VALUES (?, ?, ?)';
        db.run(sql, [setData.id, setData.name, setData.tcg_id], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE constraint failed")) {
                     res.status(409).json({ "error": `Set with id '${setData.id}' already exists.`});
                } else { res.status(400).json({ "error": err.message }); }
                return;
            }
            db.get("SELECT * FROM card_sets WHERE id = ?", [setData.id], (selectErr, row) => {
                if (selectErr) {
                    return res.status(201).json({ "message": "success (but error fetching created row)", "rowId": this.lastID });
                }
                res.status(201).json({ "message": "success", "data": row });
            });
        });
    });
});

app.put('/api/sets/:setId', (req, res) => {
    const setId = req.params.setId;
    const { name } = req.body; // We'll only allow updating the name for now

    if (!name) {
        return res.status(400).json({ "error": "Name is required for updating the set." });
    }

    // First, check if the set exists
    db.get("SELECT * FROM card_sets WHERE id = ?", [setId], (findErr, setRow) => {
        if (findErr) {
            console.error(`Error finding set ${setId} for update:`, findErr.message);
            return res.status(500).json({ "error": "Error verifying set existence." });
        }
        if (!setRow) {
            return res.status(404).json({ "error": `Set with id '${setId}' not found.` });
        }

        // Set exists, proceed with update
        const sql = 'UPDATE card_sets SET name = ? WHERE id = ?';
        db.run(sql, [name, setId], function (err) {
            if (err) {
                console.error(`Error updating set ${setId}:`, err.message);
                // In case of a UNIQUE constraint error on name (if you had one per tcg_id)
                if (err.message.includes("UNIQUE constraint failed")) {
                    return res.status(409).json({ "error": `A set with the name '${name}' might already exist for this TCG.` });
                }
                return res.status(500).json({ "error": "Could not update set in database." });
            }
            // this.changes might be 0 if the name was the same, but that's still a conceptual success.
            // Fetch and return the updated set object
            db.get("SELECT * FROM card_sets WHERE id = ?", [setId], (selectErr, updatedSetRow) => {
                if (selectErr) {
                    console.error("Error fetching updated set:", selectErr.message);
                    return res.json({ "message": "success (update successful, but error fetching updated row)", "data": {id: setId, name: name, tcg_id: setRow.tcg_id} });
                }
                if (!updatedSetRow) { // Should not happen
                    return res.status(404).json({ "error": `Updated set with id '${setId}' could not be retrieved.` });
                }
                res.json({ "message": "success", "data": updatedSetRow });
            });
        });
    });
});

// --- API Endpoints for Rarities ---
app.get('/api/sets/:setId/rarities', (req, res) => {
    const setId = req.params.setId;
    db.get("SELECT id, name FROM card_sets WHERE id = ?", [setId], (err, setRow) => {
        if (err) { res.status(500).json({ "error": "Error verifying set existence." }); return; }
        if (!setRow) { res.status(404).json({ "error": `Set with id '${setId}' not found.` }); return; }

        const sql = "SELECT * FROM rarities WHERE set_id = ? ORDER BY name";
        db.all(sql, [setId], (err, rows) => {
            if (err) { res.status(500).json({ "error": `Could not retrieve rarities for set ${setId}.` }); return; }
            res.json({ "message": "success", "set": setRow, "data": rows });
        });
    });
});

app.post('/api/sets/:setId/rarities', (req, res) => {
    const setId = req.params.setId;
    const { id, name, color_class } = req.body;
    const errors = [];
    if (!id) { errors.push("No id specified for rarity"); }
    if (!name) { errors.push("No name specified for rarity"); }
    if (!color_class) { errors.push("No color_class specified for rarity"); }
    if (errors.length) { res.status(400).json({ "error": errors.join(", ") }); return; }

    db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (err, setRow) => {
        if (err) { res.status(500).json({ "error": "Error verifying set existence." }); return; }
        if (!setRow) { res.status(404).json({ "error": `Set with id '${setId}' not found.` }); return; }

        const rarityData = { id, name, color_class, set_id: setId };
        const sql = 'INSERT INTO rarities (id, name, color_class, set_id) VALUES (?, ?, ?, ?)';
        db.run(sql, [rarityData.id, rarityData.name, rarityData.color_class, rarityData.set_id], function (err) {
            if (err) {
                if (err.message.includes("UNIQUE constraint failed")) {
                     res.status(409).json({ "error": `Rarity with id '${rarityData.id}' already exists in set '${setId}'.`});
                } else { res.status(400).json({ "error": err.message }); }
                return;
            }
            db.get("SELECT * FROM rarities WHERE set_id = ? AND id = ?", [setId, id], (selectErr, row) => {
                 if (selectErr) {
                    return res.status(201).json({ "message": "success (but error fetching created row)" });
                }
                res.status(201).json({ "message": "success", "data": row });
            });
        });
    });
});

app.delete('/api/sets/:setId/rarities/:rarityId', (req, res) => {
    const { setId, rarityId } = req.params;
    db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (err, setRow) => {
        if (err) { return res.status(500).json({ "error": "Error verifying set existence." }); }
        if (!setRow) { return res.status(404).json({ "error": `Set with id '${setId}' not found.` }); }

        const sql = 'DELETE FROM rarities WHERE set_id = ? AND id = ?';
        db.run(sql, [setId, rarityId], function (err) {
            if (err) { return res.status(500).json({ "error": "Failed to delete rarity." }); }
            if (this.changes === 0) { return res.status(404).json({ "error": `Rarity '${rarityId}' not found in set '${setId}'.` });}
            res.json({ "message": "success", "setId": setId, "rarityId": rarityId, "changes": this.changes });
        });
    });
});

app.put('/api/sets/:setId/rarities/:rarityId', (req, res) => {
    const { setId, rarityId } = req.params;
    const { name, color_class } = req.body;

    if (!name || !color_class) {
        return res.status(400).json({ "error": "Rarity name and color_class are required for updating." });
    }

    // First, check if the rarity exists in the specified set
    db.get("SELECT * FROM rarities WHERE set_id = ? AND id = ?", [setId, rarityId], (findErr, rarityRow) => {
        if (findErr) {
            console.error(`Error finding rarity '${rarityId}' in set '${setId}' for update:`, findErr.message);
            return res.status(500).json({ "error": "Error verifying rarity existence." });
        }
        if (!rarityRow) {
            return res.status(404).json({ "error": `Rarity with id '${rarityId}' not found in set '${setId}'.` });
        }

        // Rarity exists, proceed with update
        const sql = 'UPDATE rarities SET name = ?, color_class = ? WHERE set_id = ? AND id = ?';
        db.run(sql, [name, color_class, setId, rarityId], function (err) {
            if (err) {
                console.error(`Error updating rarity '${rarityId}' in set '${setId}':`, err.message);
                // Handle potential unique constraint on name within a set if you have one
                if (err.message.includes("UNIQUE constraint failed")) {
                     return res.status(409).json({ "error": `A rarity with the name '${name}' might already exist in this set.`});
                }
                return res.status(500).json({ "error": "Could not update rarity in database." });
            }

            // Fetch and return the updated rarity object
            db.get("SELECT * FROM rarities WHERE set_id = ? AND id = ?", [setId, rarityId], (selectErr, updatedRarityRow) => {
                if (selectErr) {
                    console.error("Error fetching updated rarity:", selectErr.message);
                    return res.json({ "message": "success (update successful, but error fetching updated row)", "data": {id: rarityId, name: name, color_class: color_class, set_id: setId} });
                }
                if (!updatedRarityRow) { // Should not happen if update was successful
                     return res.status(404).json({ "error": `Updated rarity with id '${rarityId}' could not be retrieved.` });
                }
                res.json({ "message": "success", "data": updatedRarityRow });
            });
        });
    });
});

// --- API Endpoints for Products ---
app.get('/api/sets/:setId/products', async (req, res) => {
    const setId = req.params.setId;
    try {
        const setRow = await new Promise((resolve, reject) => {
            db.get("SELECT id, name FROM card_sets WHERE id = ?", [setId], (err, row) => {
                if (err) reject(new Error("Error verifying set existence."));
                else if (!row) reject(new Error(`Set with id '${setId}' not found.`));
                else resolve(row);
            });
        });

        const products = await new Promise((resolve, reject) => {
            db.all("SELECT * FROM products WHERE set_id = ? ORDER BY name", [setId], (err, rows) => {
                if (err) reject(new Error(`Could not retrieve products for set ${setId}. DB Error: ${err.message}`));
                else resolve(rows);
            });
        });

        for (let product of products) {
            if (product.type === 'pack') {
                product.slotConfiguration = []; // Initialize even if no slots
                const slots = await new Promise((resolve, reject) => {
                    db.all("SELECT * FROM pack_slot_configurations WHERE product_id = ? ORDER BY slot_index", [product.id], (err, slotRows) => {
                        if (err) reject(new Error(`Could not retrieve slots for pack ${product.id}. DB error: ${err.message}`));
                        else resolve(slotRows);
                    });
                });

                for (let slot of slots) {
                    const slotToAdd = { id: slot.id, product_id: slot.product_id, slot_index: slot.slot_index, type: slot.type, count: slot.count, fixed_rarity_id: slot.fixed_rarity_id, pool: [] };
                    if (slot.type === 'pool') {
                        slotToAdd.pool = await new Promise((resolve, reject) => {
                            db.all("SELECT rarity_id, weight FROM pack_slot_pool_items WHERE slot_config_id = ?", [slot.id], (err, poolRows) => {
                                if (err) reject(new Error(`Could not retrieve pool items for slot ${slot.id}. DB error: ${err.message}`));
                                // Frontend expects rarityId
                                else resolve(poolRows.map(p => ({ rarityId: p.rarity_id, weight: p.weight })));
                            });
                        });
                    }
                    product.slotConfiguration.push(slotToAdd);
                }
            }
            // Parse guarantees or set to a default structure if null/empty
            try {
                product.box_guarantees = product.box_guarantees_json ? JSON.parse(product.box_guarantees_json) : { rules: [], notes: "" };
            } catch (e) {
                console.warn(`Invalid JSON for box_guarantees_json for product ${product.id}. Defaulting. Error: ${e.message}`);
                product.box_guarantees = { rules: [], notes: "" };
            }
            try {
                product.case_guarantees = product.case_guarantees_json ? JSON.parse(product.case_guarantees_json) : { rules: [], notes: "" };
            } catch (e) {
                console.warn(`Invalid JSON for case_guarantees_json for product ${product.id}. Defaulting. Error: ${e.message}`);
                product.case_guarantees = { rules: [], notes: "" };
            }
            // Optionally remove the _json fields if you only want the parsed version in the response
            // delete product.box_guarantees_json;
            // delete product.case_guarantees_json;
        }
        res.json({ "message": "success", "set": setRow, "data": products });
    } catch (error) {
        console.error("Error in GET /api/sets/:setId/products:", error.message);
        if (error.message.includes("not found")) res.status(404).json({ "error": error.message });
        else res.status(500).json({ "error": error.message });
    }
});

app.post('/api/sets/:setId/products', (req, res) => {
    const setId = req.params.setId;
    const { id, name, type, cards_per_pack, pack_product_id, packs_per_box, box_guarantees_json, box_product_id, boxes_per_case, case_guarantees_json, slotConfiguration } = req.body;

    const errors = [];
    if (!id) errors.push("Product ID is required.");
    if (!name) errors.push("Product name is required.");
    if (!type) errors.push("Product type is required.");
    if (type === 'pack' && (cards_per_pack === undefined )) {
        errors.push("For 'pack' type, cards_per_pack is required.");
    }
    // Add more validation for box/case specific required fields if necessary
    if (type === 'box' && (packs_per_box === undefined || pack_product_id === undefined)) {
        errors.push("For 'box' type, packs_per_box and pack_product_id are required.");
    }
    if (type === 'case' && (boxes_per_case === undefined || box_product_id === undefined)) {
        errors.push("For 'case' type, boxes_per_case and box_product_id are required.");
    }
    if (errors.length > 0) {
        return res.status(400).json({ "error": errors.join("; ") });
    }

    // Validate JSON strings if provided
    try {
        if (type === 'box' && box_guarantees_json) JSON.parse(box_guarantees_json);
        if (type === 'case' && case_guarantees_json) JSON.parse(case_guarantees_json);
    } catch (e) {
        return res.status(400).json({error: "Invalid JSON format in guarantees."});
    }


    db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (setCheckErr, setRow) => {
        if (setCheckErr) { return res.status(500).json({ "error": "Error verifying set existence." }); }
        if (!setRow) { return res.status(404).json({ "error": `Set with id '${setId}' not found.` }); }

        db.serialize(() => {
            db.run("BEGIN TRANSACTION", (transactionErr) => {
                if (transactionErr) {
                    console.error("Failed to begin transaction:", transactionErr.message);
                    return res.status(500).json({ error: "Database error starting transaction." });
                }

                const productSql = `INSERT INTO products
                    (id, name, type, set_id, cards_per_pack, pack_product_id, packs_per_box, box_guarantees_json, box_product_id, boxes_per_case, case_guarantees_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
                const productParams = [
                    id, name, type, setId,
                    type === 'pack' ? cards_per_pack : null,
                    type === 'box' ? pack_product_id : null,
                    type === 'box' ? packs_per_box : null,
                    type === 'box' ? (box_guarantees_json || JSON.stringify({rules: [], notes: ""})) : null,
                    type === 'case' ? box_product_id : null,
                    type === 'case' ? boxes_per_case : null,
                    type === 'case' ? (case_guarantees_json || JSON.stringify({rules: [], notes: ""})) : null
                ];

                db.run(productSql, productParams, async function(productErr) {
                    if (productErr) {
                        db.run("ROLLBACK");
                        if (productErr.message.includes("UNIQUE constraint failed")) {
                            return res.status(409).json({ "error": `Product with id '${id}' already exists.` });
                        }
                        console.error("Error inserting product:", productErr.message);
                        return res.status(400).json({ "error": "Failed to create product: " + productErr.message });
                    }

                    const productId = id; // Use the provided ID

                    if (type === 'pack' && Array.isArray(slotConfiguration) && slotConfiguration.length > 0) {
                        try {
                            for (let i = 0; i < slotConfiguration.length; i++) {
                                const slot = slotConfiguration[i];
                                // Frontend sends rarityId for fixed, rarity_id for pool items
                                const fixedRarityIdToUse = slot.type === 'fixed' ? slot.rarityId : null;
                                const slotConfigId = await new Promise((resolve, reject) => {
                                    const slotSql = `INSERT INTO pack_slot_configurations
                                        (product_id, slot_index, type, count, fixed_rarity_id)
                                        VALUES (?, ?, ?, ?, ?)`;
                                    db.run(slotSql, [productId, i, slot.type, slot.count, fixedRarityIdToUse], function(slotErr) {
                                        if (slotErr) return reject(new Error("Slot insert failed: " + slotErr.message));
                                        resolve(this.lastID);
                                    });
                                });

                                if (slot.type === 'pool' && Array.isArray(slot.pool) && slot.pool.length > 0) {
                                    for (const poolItem of slot.pool) {
                                        await new Promise((resolvePool, rejectPool) => {
                                            const poolSql = `INSERT INTO pack_slot_pool_items
                                                (slot_config_id, rarity_id, weight) VALUES (?, ?, ?)`;
                                            // Frontend sends rarity_id in poolItem
                                            db.run(poolSql, [slotConfigId, poolItem.rarity_id, poolItem.weight], function(poolErr) {
                                                if (poolErr) return rejectPool(new Error("Pool item insert failed: " + poolErr.message));
                                                resolvePool();
                                            });
                                        });
                                    }
                                }
                            }
                            db.run("COMMIT", (commitErr) => {
                                if (commitErr) {
                                     console.error("Failed to commit transaction after slots:", commitErr.message);
                                     db.run("ROLLBACK");
                                     return res.status(500).json({ error: "Database error committing transaction." });
                                }
                                fetchProductWithDetails(productId, res, 201);
                            });
                        } catch (slotProcessingErr) {
                            db.run("ROLLBACK");
                            console.error("Error processing slot configuration:", slotProcessingErr.message);
                            return res.status(400).json({ "error": "Failed to create pack slot details: " + slotProcessingErr.message });
                        }
                    } else {
                        db.run("COMMIT", (commitErr) => {
                             if (commitErr) {
                                console.error("Error committing product (no slots/not pack):", commitErr.message);
                                db.run("ROLLBACK");
                                return res.status(500).json({ error: "Database error committing product."});
                            }
                            fetchProductWithDetails(productId, res, 201);
                        });
                    }
                });
            });
        });
    });
});


app.put('/api/products/:productId', (req, res) => {
    const productId = req.params.productId;
    const {
        name, type, cards_per_pack,
        pack_product_id, packs_per_box, box_guarantees_json,
        box_product_id, boxes_per_case, case_guarantees_json,
        slotConfiguration // Array for packs
    } = req.body;

    if (!name || !type) {
        return res.status(400).json({ error: "Product name and type are required for update." });
    }

    db.get("SELECT * FROM products WHERE id = ?", [productId], (err, productRow) => {
        if (err) { return res.status(500).json({ "error": "Error verifying product existence: " + err.message }); }
        if (!productRow) { return res.status(404).json({ "error": `Product with id '${productId}' not found.` }); }

        // Start transaction
        db.serialize(() => {
            db.run("BEGIN TRANSACTION", (txErr) => {
                if (txErr) {
                    console.error("Begin transaction error:", txErr.message);
                    return res.status(500).json({ error: "Failed to start database transaction." });
                }

                let updateQueryParts = [];
                let queryParams = [];

                if (name !== undefined) {
                    updateQueryParts.push("name = ?");
                    queryParams.push(name);
                }
                // IMPORTANT: We assume 'type' itself is not changed by this PUT.
                // If type can change, logic to null out old type-specific fields is crucial.
                // For now, we update fields based on the *existing* productRow.type or the *sent* type
                // if it's a consistent update (e.g. updating a pack's details).
                // The frontend sends the product's current type.

                if (type === 'pack') {
                    if (cards_per_pack !== undefined) {
                        updateQueryParts.push("cards_per_pack = ?");
                        queryParams.push(cards_per_pack);
                    }
                    // Null out other type-specific fields if this product is being asserted as a 'pack'
                    updateQueryParts.push("pack_product_id = NULL", "packs_per_box = NULL", "box_guarantees_json = NULL");
                    updateQueryParts.push("box_product_id = NULL", "boxes_per_case = NULL", "case_guarantees_json = NULL");

                } else if (type === 'box') {
                    if (pack_product_id !== undefined) {
                        updateQueryParts.push("pack_product_id = ?");
                        queryParams.push(pack_product_id);
                    }
                    if (packs_per_box !== undefined) {
                        updateQueryParts.push("packs_per_box = ?");
                        queryParams.push(packs_per_box);
                    }
                    if (box_guarantees_json !== undefined) {
                        try { JSON.parse(box_guarantees_json); } catch (e) {
                            db.run("ROLLBACK"); return res.status(400).json({error: "Invalid JSON for box_guarantees_json"});
                        }
                        updateQueryParts.push("box_guarantees_json = ?");
                        queryParams.push(box_guarantees_json);
                    }
                    // Null out other type-specific fields
                    updateQueryParts.push("cards_per_pack = NULL");
                    updateQueryParts.push("box_product_id = NULL", "boxes_per_case = NULL", "case_guarantees_json = NULL");

                } else if (type === 'case') {
                    if (box_product_id !== undefined) {
                        updateQueryParts.push("box_product_id = ?");
                        queryParams.push(box_product_id);
                    }
                    if (boxes_per_case !== undefined) {
                        updateQueryParts.push("boxes_per_case = ?");
                        queryParams.push(boxes_per_case);
                    }
                    if (case_guarantees_json !== undefined) {
                         try { JSON.parse(case_guarantees_json); } catch (e) {
                            db.run("ROLLBACK"); return res.status(400).json({error: "Invalid JSON for case_guarantees_json"});
                        }
                        updateQueryParts.push("case_guarantees_json = ?");
                        queryParams.push(case_guarantees_json);
                    }
                     // Null out other type-specific fields
                    updateQueryParts.push("cards_per_pack = NULL");
                    updateQueryParts.push("pack_product_id = NULL", "packs_per_box = NULL", "box_guarantees_json = NULL");
                }
                // Always ensure the type column itself is set (even if it's the same)
                updateQueryParts.push("type = ?");
                queryParams.push(type);


                if (updateQueryParts.length === 0) { // Nothing to update in main table
                    db.run("ROLLBACK"); // Or COMMIT if no error but no changes
                    return res.status(400).json({ error: "No updatable fields provided for product." });
                }

                queryParams.push(productId); // For WHERE id = ?
                const updateProductSql = `UPDATE products SET ${updateQueryParts.join(", ")} WHERE id = ?`;

                db.run(updateProductSql, queryParams, async function(updateErr) {
                    if (updateErr) {
                        db.run("ROLLBACK");
                        console.error("Error updating product main table:", updateErr.message);
                        return res.status(400).json({ "error": "Failed to update product: " + updateErr.message });
                    }

                    if (type === 'pack' && slotConfiguration !== undefined) {
                    (async () => { // Use an async IIFE
                        try {
                            // Delete old slots first (important to do this in sequence)
                            await new Promise((resolve, reject) => {
                                db.run("DELETE FROM pack_slot_pool_items WHERE slot_config_id IN (SELECT id FROM pack_slot_configurations WHERE product_id = ?)", [productId], (err) => {
                                    if (err) reject(new Error("Pool items deletion failed: " + err.message)); else resolve();
                                });
                            });
                            await new Promise((resolve, reject) => {
                                db.run("DELETE FROM pack_slot_configurations WHERE product_id = ?", [productId], (err) => {
                                    if (err) reject(new Error("Slot configurations deletion failed: " + err.message)); else resolve();
                                });
                            });

                            // Insert new slots if provided
                            if (Array.isArray(slotConfiguration) && slotConfiguration.length > 0) {
                                for (let i = 0; i < slotConfiguration.length; i++) {
                                    const slot = slotConfiguration[i];
                                    const fixedRarityIdToUse = slot.type === 'fixed' ? slot.rarityId : null;

                                    const slotConfigId = await new Promise((resolve, reject) => {
                                        const slotSql = `INSERT INTO pack_slot_configurations (product_id, slot_index, type, count, fixed_rarity_id) VALUES (?, ?, ?, ?, ?)`;
                                        db.run(slotSql, [productId, i, slot.type, slot.count, fixedRarityIdToUse], function(slotInsertErr) {
                                            if (slotInsertErr) return reject(new Error("Slot insert failed: " + slotInsertErr.message));
                                            resolve(this.lastID);
                                        });
                                    });

                                    if (slot.type === 'pool' && Array.isArray(slot.pool) && slot.pool.length > 0) {
                                        for (const poolItem of slot.pool) {
                                            // ***** VALIDATION ADDED HERE *****
                                            if (poolItem.rarity_id === null || poolItem.rarity_id === undefined || String(poolItem.rarity_id).trim() === "") {
                                                // Throw an error that will be caught by the outer catch block
                                                throw new Error(`Pool item in slot ${i + 1} has a missing or invalid rarity_id. Please correct the pack configuration using 'Edit Pack Config'.`);
                                            }
                                            // *********************************
                                            await new Promise((resolvePool, rejectPoolCallback) => {
                                                const poolSql = `INSERT INTO pack_slot_pool_items (slot_config_id, rarity_id, weight) VALUES (?, ?, ?)`;
                                                db.run(poolSql, [slotConfigId, poolItem.rarity_id, poolItem.weight], function(poolInsertErr) {
                                                    if (poolInsertErr) return rejectPoolCallback(new Error("Pool item insert failed: " + poolInsertErr.message));
                                                    resolvePool();
                                                });
                                            });
                                        }
                                    }
                                }
                            }
                            // All slot processing successful, commit
                            db.run("COMMIT", (commitErr) => {
                                if (commitErr) {
                                    console.error("Commit failed after slots:", commitErr.message);
                                    db.run("ROLLBACK", () => {}); // Attempt rollback, but response might have been sent by catch
                                    // Avoid sending another response if one was already sent by the catch block
                                    if (!res.headersSent) {
                                        res.status(500).json({ error: "DB Commit error after slots." });
                                    }
                                    return;
                                }
                                fetchProductWithDetails(productId, res);
                            });
                        } catch (slotProcessingErr) { // Catch errors from the async IIFE (including our new validation error)
                            db.run("ROLLBACK", () => { // Ensure rollback on any slot processing error
                                console.error("Error processing slots during update (caught in IIFE):", slotProcessingErr.message);
                                if (!res.headersSent) {
                                     // If it's our custom validation error, send 400, otherwise 500
                                    const statusCode = slotProcessingErr.message.includes("missing or invalid rarity_id") ? 400 : 500;
                                    res.status(statusCode).json({ "error": slotProcessingErr.message });
                                }
                            });
                        }
                    })(); // Immediately invoke the async function
                } else { // Not a pack, or slotConfiguration was not provided for update (and not a pack type)
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) { console.error("Commit failed (not pack or no slots to update):", commitErr.message); db.run("ROLLBACK"); return res.status(500).json({error: "DB Commit error."}); }
                        fetchProductWithDetails(productId, res);
                    });
                }
                });
            });
        });
    });
});


app.delete('/api/products/:productId', (req, res) => {
    const productId = req.params.productId;
    // It's good practice to delete related child records first if not handled by CASCADE
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        // Delete pool items linked to slots of this product
        db.run("DELETE FROM pack_slot_pool_items WHERE slot_config_id IN (SELECT id FROM pack_slot_configurations WHERE product_id = ?)", [productId], function(err1) {
            if (err1) {
                db.run("ROLLBACK");
                console.error(`Error deleting pool items for product '${productId}':`, err1.message);
                return res.status(500).json({ "error": "Failed to delete related pool items for product." });
            }
            // Delete slot configurations for this product
            db.run("DELETE FROM pack_slot_configurations WHERE product_id = ?", [productId], function(err2) {
                if (err2) {
                    db.run("ROLLBACK");
                    console.error(`Error deleting slot configurations for product '${productId}':`, err2.message);
                    return res.status(500).json({ "error": "Failed to delete slot configurations for product." });
                }
                // Finally, delete the product itself
                db.run('DELETE FROM products WHERE id = ?', [productId], function(err3) {
                    if (err3) {
                        db.run("ROLLBACK");
                        console.error(`Error deleting product '${productId}':`, err3.message);
                        return res.status(500).json({ "error": "Failed to delete product." });
                    }
                    if (this.changes === 0) {
                        db.run("ROLLBACK"); // Or COMMIT if no product found is acceptable
                        return res.status(404).json({ "error": `Product with id '${productId}' not found.` });
                    }
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) {
                             console.error("Commit failed product deletion:", commitErr);
                             db.run("ROLLBACK");
                             return res.status(500).json({error: "DB Commit error on product deletion."});
                        }
                        res.json({ "message": "success", "productId": productId, "changes": this.changes });
                    });
                });
            });
        });
    });
});


// --- API Endpoints for Cards ---
app.get('/api/sets/:setId/cards', (req, res) => {
    const setId = req.params.setId;
    // First, verify the set exists
    db.get("SELECT id, name FROM card_sets WHERE id = ?", [setId], (err, setRow) => {
        if (err) {
            console.error(`Error verifying set ${setId} for fetching cards:`, err.message);
            res.status(500).json({ "error": "Error verifying set existence." });
            return;
        }
        if (!setRow) {
            res.status(404).json({ "error": `Set with id '${setId}' not found.` });
            return;
        }
        // Set exists, proceed to fetch cards
        const sql = `
            SELECT c.*, r.name as rarity_name, r.color_class as rarity_color_class
            FROM cards c
            LEFT JOIN rarities r ON c.rarity_id = r.id AND c.set_id = r.set_id
            WHERE c.set_id = ? ORDER BY c.card_number, c.id`; // Order by card_number, then id as a fallback
        db.all(sql, [setId], (cardErr, rows) => {
            if (cardErr) {
                console.error(`Error fetching cards for set ${setId}:`, cardErr.message);
                res.status(500).json({ "error": `Could not retrieve cards for set ${setId}.` });
                return;
            }
            res.json({ "message": "success", "set": setRow, "data": rows });
        });
    });
});

app.post('/api/sets/:setId/cards', (req, res) => {
    const setId = req.params.setId;
    const { id, name, image_url, market_price, card_number, rarity_id } = req.body;

    const errors = [];
    if (!id) { errors.push("No id (card number/identifier) specified for card"); }
    if (!name) { errors.push("No name specified for card"); }
    if (!rarity_id) { errors.push("No rarity_id specified for card"); }
    if (market_price === undefined || isNaN(parseFloat(market_price))) {
        errors.push("Market price must be a valid number (e.g., 0.00).");
    }

    if (errors.length > 0) {
        return res.status(400).json({ "error": errors.join(", ") });
    }

    // 1. Verify Set existence
    db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (setErr, setRow) => {
        if (setErr) {
            console.error(`Error verifying set ${setId} for adding card:`, setErr.message);
            return res.status(500).json({ "error": "Error verifying set existence." });
        }
        if (!setRow) {
            return res.status(404).json({ "error": `Cannot add card: Set with id '${setId}' not found.` });
        }

        // 2. Verify Rarity existence in the same set
        db.get("SELECT id FROM rarities WHERE set_id = ? AND id = ?", [setId, rarity_id], (rarityErr, rarityRow) => {
            if (rarityErr) {
                console.error(`Error verifying rarity ${rarity_id} for adding card to set ${setId}:`, rarityErr.message);
                return res.status(500).json({ "error": "Error verifying rarity existence." });
            }
            if (!rarityRow) {
                return res.status(400).json({ "error": `Rarity with id '${rarity_id}' not found in set '${setId}'. Cannot add card.` });
            }

            // 3. Proceed with insert
            const finalCardNumber = card_number && card_number.trim() !== '' ? card_number.trim() : id;
            const finalMarketPrice = parseFloat(market_price);
            const finalImageUrl = image_url || null;

            const cardData = {
                id, name, image_url: finalImageUrl, market_price: finalMarketPrice,
                card_number: finalCardNumber, set_id: setId, rarity_id
            };
            const sql = `INSERT INTO cards (id, name, image_url, market_price, card_number, set_id, rarity_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`;
            db.run(sql, [cardData.id, cardData.name, cardData.image_url, cardData.market_price, cardData.card_number, cardData.set_id, cardData.rarity_id], function (insertErr) {
                if (insertErr) {
                    if (insertErr.message.includes("UNIQUE constraint failed")) {
                         res.status(409).json({ "error": `Card with id '${cardData.id}' already exists in set '${setId}'.`});
                    } else {
                        console.error(`Error inserting card ${cardData.id} into set ${setId}:`, insertErr.message);
                        res.status(400).json({ "error": insertErr.message });
                    }
                    return;
                }
                // Fetch and return the newly created card object with rarity details
                db.get(`SELECT c.*, r.name as rarity_name, r.color_class as rarity_color_class
                        FROM cards c
                        LEFT JOIN rarities r ON c.rarity_id = r.id AND c.set_id = r.set_id
                        WHERE c.set_id = ? AND c.id = ?`,
                        [setId, cardData.id], (selectErr, row) => {
                    if (selectErr) {
                        console.error("Error fetching created card:", selectErr.message);
                        return res.status(201).json({ "message": "success (but error fetching created card data)" });
                    }
                    res.status(201).json({ "message": "success", "data": row });
                });
            });
        });
    });
});

app.put('/api/sets/:setId/cards/:cardId', (req, res) => {
    const { setId, cardId } = req.params;
    const { name, rarity_id, market_price, image_url, card_number } = req.body;

    const errors = [];
    if (!name) errors.push("Card name is required.");
    if (!rarity_id) errors.push("Rarity ID is required.");
    if (market_price === undefined || isNaN(parseFloat(market_price))) {
         errors.push("Market price must be a valid number.");
    }

    if (errors.length > 0) {
        return res.status(400).json({ "error": errors.join(", ") });
    }

    // 1. Verify Set and Card existence (cardRow is not strictly needed here but good for 404 check)
    db.get("SELECT * FROM cards WHERE set_id = ? AND id = ?", [setId, cardId], (findCardErr, cardRow) => {
        if (findCardErr) {
            console.error(`Error finding card ${cardId} in set ${setId} for update:`, findCardErr.message);
            return res.status(500).json({ "error": "Error verifying card existence." });
        }
        if (!cardRow) {
            return res.status(404).json({ "error": `Card with id '${cardId}' not found in set '${setId}'.` });
        }

        // 2. Verify new Rarity existence in the same set
        db.get("SELECT id FROM rarities WHERE set_id = ? AND id = ?", [setId, rarity_id], (findRarityErr, rarityRow) => {
            if (findRarityErr) {
                console.error(`Error verifying rarity ${rarity_id} for updating card in set ${setId}:`, findRarityErr.message);
                return res.status(500).json({ "error": "Error verifying rarity existence." });
            }
            if (!rarityRow) {
                return res.status(400).json({ "error": `New rarity with id '${rarity_id}' not found in set '${setId}'. Cannot update card.` });
            }

            // 3. Proceed with update
            const finalCardNumber = card_number && card_number.trim() !== '' ? card_number.trim() : cardId; // Default to original cardId if new card_number is empty
            const finalMarketPrice = parseFloat(market_price);
            const finalImageUrl = image_url || null;

            const sql = `UPDATE cards
                         SET name = ?, rarity_id = ?, market_price = ?, image_url = ?, card_number = ?
                         WHERE set_id = ? AND id = ?`;
            db.run(sql, [name, rarity_id, finalMarketPrice, finalImageUrl, finalCardNumber, setId, cardId], function (updateErr) {
                if (updateErr) {
                    console.error(`Error updating card '${cardId}' in set '${setId}':`, updateErr.message);
                    return res.status(500).json({ "error": "Could not update card in database." });
                }

                // Fetch and return the updated card object with rarity details
                db.get(`SELECT c.*, r.name as rarity_name, r.color_class as rarity_color_class
                        FROM cards c
                        LEFT JOIN rarities r ON c.rarity_id = r.id AND c.set_id = r.set_id
                        WHERE c.set_id = ? AND c.id = ?`,
                        [setId, cardId], (selectErr, updatedCardRow) => {
                    if (selectErr) {
                        console.error("Error fetching updated card:", selectErr.message);
                        // Return what we can if the select fails but update likely succeeded
                        return res.json({ "message": "success (update successful, but error fetching updated row)", data: { id: cardId, set_id: setId, name, rarity_id, market_price: finalMarketPrice, image_url: finalImageUrl, card_number: finalCardNumber } });
                    }
                    if (!updatedCardRow) { // Should not happen if update was successful and card wasn't deleted concurrently
                         return res.status(404).json({ "error": `Updated card with id '${cardId}' could not be retrieved.` });
                    }
                    res.json({ "message": "success", "data": updatedCardRow });
                });
            });
        });
    });
});

app.delete('/api/sets/:setId/cards/:cardId', (req, res) => {
    const { setId, cardId } = req.params;
     db.get("SELECT id FROM card_sets WHERE id = ?", [setId], (err, setRow) => { // Verify set exists
        if (err) {
            console.error(`Error verifying set ${setId} for deleting card ${cardId}:`, err.message);
            return res.status(500).json({ "error": "Error verifying set existence." });
        }
        if (!setRow) { return res.status(404).json({ "error": `Set with id '${setId}' not found.` }); }

        const sql = 'DELETE FROM cards WHERE set_id = ? AND id = ?';
        db.run(sql, [setId, cardId], function (deleteErr) {
            if (deleteErr) {
                console.error(`Error deleting card '${cardId}' from set '${setId}':`, deleteErr.message);
                return res.status(500).json({ "error": "Failed to delete card." });
            }
            if (this.changes === 0) {
                return res.status(404).json({ "error": `Card with id '${cardId}' not found in set '${setId}'.` });
            }
            res.json({
                "message": "success",
                "setId": setId,
                "cardId": cardId,
                "changes": this.changes
            });
        });
    });
});

// Helper function to fetch product with details (you should already have this)
async function fetchProductWithDetails(productId, res, statusCode = 200) {
    try {
        const product = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM products WHERE id = ?", [productId], (err, row) => {
                if (err) reject(new Error(`DB Error fetching product ${productId}: ${err.message}`));
                else if (!row) reject(new Error(`Product ${productId} not found after operation.`));
                else resolve(row);
            });
        });

        if (product.type === 'pack') {
            product.slotConfiguration = [];
            const slots = await new Promise((resolve, reject) => {
                 db.all("SELECT * FROM pack_slot_configurations WHERE product_id = ? ORDER BY slot_index", [product.id], (err, slotRows) => {
                    if (err) reject(new Error(`DB Error fetching slots for pack ${product.id}: ${err.message}`));
                    else resolve(slotRows);
                });
            });
            for (let slot of slots) {
                 const slotToAdd = { 
                    id: slot.id, 
                    product_id: slot.product_id, 
                    slot_index: slot.slot_index, 
                    type: slot.type, 
                    count: slot.count, 
                    fixed_rarity_id: slot.fixed_rarity_id, // from DB
                    pool: [] 
                };
                if (slot.type === 'pool') {
                    slotToAdd.pool = await new Promise((resolve, reject) => {
                        db.all("SELECT rarity_id, weight FROM pack_slot_pool_items WHERE slot_config_id = ?", [slot.id], (err, poolRows) => {
                            if (err) reject(new Error(`DB Error fetching pool items for slot ${slot.id}: ${err.message}`));
                            else resolve(poolRows.map(p => ({ rarity_id: p.rarity_id, weight: p.weight }))); // Ensure consistency
                        });
                    });
                }
                product.slotConfiguration.push(slotToAdd);
            }
        }
        try { product.box_guarantees_config = product.box_guarantees_json ? JSON.parse(product.box_guarantees_json) : { rules: [], notes: "" }; }
        catch (e) { 
            console.warn(`Product ${productId} has invalid box_guarantees_json during fetchProductWithDetails.`);
            product.box_guarantees_config = { rules: [], notes: "Error parsing box guarantees." };
        }
        try { product.case_guarantees_config = product.case_guarantees_json ? JSON.parse(product.case_guarantees_json) : { rules: [], notes: "" }; }
        catch (e) { 
            console.warn(`Product ${productId} has invalid case_guarantees_json during fetchProductWithDetails.`);
            product.case_guarantees_config = { rules: [], notes: "Error parsing case guarantees." };
        }

        delete product.box_guarantees_json; // Clean up response
        delete product.case_guarantees_json;

        if (!res.headersSent) {
            res.status(statusCode).json({ message: "success", data: product });
        }
    } catch (error) {
        console.error("Error in fetchProductWithDetails for product", productId, ":", error.message);
        const errStatus = error.message.includes("not found") ? 404 : 500;
        if (!res.headersSent) {
             res.status(errStatus).json({ message: "Operation may have succeeded, but error fetching/processing full product details.", error: error.message });
        }
    }
}

// VVVVVV THIS IS THE FUNCTION THAT WAS LIKELY MISSING OR MISPLACED VVVVVV
// Helper to fetch a full template with rules, used by POST and PUT for Guarantee Templates
function fetchFullTemplate(templateId, res, successStatusCode = 200) {
    let templateData = {};
    db.get("SELECT id, name, description, scope FROM guarantee_templates WHERE id = ?", [templateId], (err, templateRow) => {
        if (err) {
            console.error(`Error fetching template ${templateId} in fetchFullTemplate:`, err.message);
            if (!res.headersSent) return res.status(500).json({ message: "Error fetching template details after operation.", error: err.message });
            return;
        }
        if (!templateRow) {
            if (!res.headersSent) return res.status(404).json({ message: "Template not found after operation.", error: `Template with id ${templateId} not found.`});
            return;
        }
        templateData = templateRow;
        templateData.rules = []; // Initialize rules array

        const rulesSql = "SELECT rule_json, sort_order FROM guarantee_template_rules WHERE template_id = ? ORDER BY sort_order, id";
        db.all(rulesSql, [templateId], (rulesErr, ruleRows) => {
            if (rulesErr) {
                console.error(`Error fetching rules for template ${templateId} in fetchFullTemplate:`, rulesErr.message);
                templateData.rules_error = "Could not retrieve rules for template.";
                // Still return template info, but indicate rules might be missing
                if (!res.headersSent) return res.status(successStatusCode).json({ "message": "success_partial", "data": templateData, "error_details": "Could not retrieve all rule details." });
                return;
            }
            try {
                templateData.rules = ruleRows.map(r => JSON.parse(r.rule_json));
            } catch (parseError) {
                console.error(`Error parsing rule_json for template ${templateId} in fetchFullTemplate:`, parseError.message);
                templateData.rules_error = "Error parsing stored rules for template.";
            }
            if (!res.headersSent) {
                res.status(successStatusCode).json({ "message": "success", "data": templateData });
            }
        });
    });
}
// ^^^^^^ ENSURE THIS FUNCTION IS PRESENT AND CORRECTLY SPELLED ^^^^^^

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// --- API Endpoints for TCGs ---
app.get('/api/tcgs', (req, res) => {
    const sql = "SELECT * FROM tcgs ORDER BY name";
    db.all(sql, [], (err, rows) => {
        if (err) {
          console.error("Error fetching TCGs:", err.message);
          res.status(500).json({ "error": "Could not retrieve TCGs from database." });
          return;
        }
        res.json({ "message": "success", "data": rows });
      });
});

// Helper function to fetch product with details (used after update or create)
async function fetchProductWithDetails(productId, res, statusCode = 200) {
    try {
        const product = await new Promise((resolve, reject) => {
            db.get("SELECT * FROM products WHERE id = ?", [productId], (err, row) => {
                if (err) reject(new Error(`Could not retrieve product ${productId}. DB Error: ${err.message}`));
                else if (!row) reject(new Error(`Product ${productId} not found after operation.`));
                else resolve(row);
            });
        });

        if (product.type === 'pack') {
            product.slotConfiguration = [];
            const slots = await new Promise((resolve, reject) => {
                db.all("SELECT * FROM pack_slot_configurations WHERE product_id = ? ORDER BY slot_index", [product.id], (err, slotRows) => {
                    if (err) reject(new Error(`Could not retrieve slots for pack ${product.id}. DB error: ${err.message}`));
                    else resolve(slotRows);
                });
            });
            for (let slot of slots) {
                 // Ensure consistent naming: frontend uses rarityId for fixed slot payload, but db stores as fixed_rarity_id.
                 // The GET should return what the DB has.
                 const slotToAdd = {
                    id: slot.id, product_id: slot.product_id, slot_index: slot.slot_index,
                    type: slot.type, count: slot.count,
                    fixed_rarity_id: slot.fixed_rarity_id, // from DB
                    pool: []
                };
                if (slot.type === 'pool') {
                    slotToAdd.pool = await new Promise((resolve, reject) => {
                        db.all("SELECT rarity_id, weight FROM pack_slot_pool_items WHERE slot_config_id = ?", [slot.id], (err, poolRows) => {
                            if (err) reject(new Error(`Could not retrieve pool items for slot ${slot.id}. DB error: ${err.message}`));
                            // Frontend expects pool items to have rarity_id (consistent with payload)
                            else resolve(poolRows.map(p => ({ rarity_id: p.rarity_id, weight: p.weight })));
                        });
                    });
                }
                product.slotConfiguration.push(slotToAdd);
            }
        }
        // Parse guarantees and remove the _json fields for the response
        try {
            product.box_guarantees = product.box_guarantees_json ? JSON.parse(product.box_guarantees_json) : { rules: [], notes: "" };
        } catch (e) { product.box_guarantees = { rules: [], notes: "Error parsing box guarantees." }; }
        try {
            product.case_guarantees = product.case_guarantees_json ? JSON.parse(product.case_guarantees_json) : { rules: [], notes: "" };
        } catch (e) { product.case_guarantees = { rules: [], notes: "Error parsing case guarantees." }; }

        delete product.box_guarantees_json;
        delete product.case_guarantees_json;

        res.status(statusCode).json({ message: "success", data: product });
    } catch (error) {
        console.error("Error in fetchProductWithDetails for product", productId, ":", error.message);
        // If product was not found after an operation, it's a problem.
        if (error.message.includes("not found after operation")) {
            return res.status(404).json({ message: "Operation may have succeeded, but product could not be retrieved.", error: error.message });
        }
        res.status(500).json({ message: "Operation was likely successful, but error fetching full product details. Please reload.", error: error.message });
    }
}