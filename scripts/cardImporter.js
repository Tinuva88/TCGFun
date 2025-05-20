// scripts/cardImporter.js

// DOM Elements to be assigned in initCardImporter (called from app.js)
let cardCsvImportInput, importCardsCsvButton, cardImportStatus;

const cardImporter = {
    initCardImporter: function() {
        console.log("Card Importer Initializing...");
        cardCsvImportInput = document.getElementById('cardCsvImportInput');
        importCardsCsvButton = document.getElementById('importCardsCsvButton');
        cardImportStatus = document.getElementById('cardImportStatus');

        importCardsCsvButton?.addEventListener('click', this.handleCsvCardImport);
    },

    handleCsvCardImport: async function() {
        if (!appState.activeSetId) {
            uiManager.showStatus("Please select a Set first to import cards into.", "error");
            return;
        }
        if (!cardCsvImportInput || !cardCsvImportInput.files || cardCsvImportInput.files.length === 0) {
            uiManager.showStatus("Please select a CSV file to import.", "warning");
            return;
        }

        const file = cardCsvImportInput.files[0];
        if (!file.name.toLowerCase().endsWith(".csv")) { // Simpler check
             uiManager.showStatus("Invalid file type. Please select a .csv file.", "error");
            return;
        }

        uiManager.showStatus(`Importing cards from ${file.name}... This may take a moment.`, "info", 0);
            if(cardImportStatus) cardImportStatus.innerHTML = `<p class="text-yellow-400">Processing CSV... please wait.</p>`;

            try {
                const result = await apiService.importCardsCsv(appState.activeSetId, file);
                console.log("CSV Import Result from API:", result);

                let statusMessages = [];
                statusMessages.push(`<p>Import process finished in ${result.duration !== undefined ? result.duration.toFixed(2) + 's' : 'N/A'}.</p>`);
                statusMessages.push(`<p>Rows Processed in CSV: ${result.processedRows || 0}</p>`);
                
                if (result.dbOperationsSuccessful > 0) {
                    statusMessages.push(`<p class="text-green-500">Cards Inserted/Updated in DB: ${result.dbOperationsSuccessful}</p>`);
                }
                const totalFailures = (result.failedRowsInDataValidation || 0) + (result.dbInsertErrors || 0);
                if (totalFailures > 0) {
                    statusMessages.push(`<p class="text-red-500">Total Rows Failed: ${totalFailures}</p>`);
                } else if (result.dbOperationsSuccessful > 0) {
                     statusMessages.push(`<p class="text-green-500">All valid rows processed successfully!</p>`);
                }


                if (result.errors && result.errors.length > 0) {
                    statusMessages.push('<p class="text-red-400 mt-2">Error Details (first 10):</p><ul class="text-xs list-disc list-inside text-red-300 max-h-40 overflow-y-auto bg-gray-700 p-2 rounded">');
                    result.errors.slice(0, 10).forEach(err => {
                        statusMessages.push(`<li>${err}</li>`);
                    });
                    if (result.errors.length > 10) {
                         statusMessages.push(`<li>...and ${result.errors.length - 10} more errors.</li>`);
                    }
                    statusMessages.push('</ul>');
                }
                
                if(cardImportStatus) cardImportStatus.innerHTML = statusMessages.join('');
                uiManager.showStatus(
                    `CSV import: ${result.dbOperationsSuccessful || 0} upserted, ${totalFailures} failed.`, 
                    result.dbOperationsSuccessful > 0 && totalFailures === 0 ? "success" : (result.dbOperationsSuccessful > 0 ? "warning" : "error"), 
                    10000
                );

                if (result.dbOperationsSuccessful > 0) {
                    if (appState.activeTCGId && appState.activeSetId) {
                        if (typeof appActions !== 'undefined' && appActions.refreshCardListView) {
                            appActions.refreshCardListView();
                        } else { 
                            await refreshCardListViewForCurrentSet();
                        }
                    }
                }

            } catch (error) { // Catch errors from apiService call itself (e.g. network, or non-2xx response not handled as JSON by apiService)
                console.error("Error importing cards CSV (frontend catch):", error);
                const errorDetail = error.message || "Unknown error";
                if(cardImportStatus) cardImportStatus.innerHTML = `<p class="text-red-400">Import failed: ${errorDetail}</p>`;
                uiManager.showStatus(`Import failed: ${errorDetail}`, "error");
            } finally {
                if(cardCsvImportInput) cardCsvImportInput.value = '';
            }
        }
};