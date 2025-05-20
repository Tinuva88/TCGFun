// tcg-editor-backend/database.js
const sqlite3 = require('sqlite3').verbose();
const DBSOURCE = "tcgdata.sqlite";

let db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      console.error("Error opening database:", err.message);
      throw err;
    } else {
        console.log('Connected to the SQLite database.');
        db.serialize(() => { 
            // TCGs Table
            db.run(`CREATE TABLE IF NOT EXISTS tcgs (
                id TEXT PRIMARY KEY UNIQUE,
                name TEXT NOT NULL
            )`, (err) => {
                if (err) { console.error("Error creating 'tcgs' table:", err.message); }
                else { console.log("'tcgs' table created or already exists."); }
            });

            // Card Sets Table
            db.run(`CREATE TABLE IF NOT EXISTS card_sets (
                id TEXT PRIMARY KEY UNIQUE, 
                name TEXT NOT NULL,        
                tcg_id TEXT NOT NULL,      
                FOREIGN KEY (tcg_id) REFERENCES tcgs(id) ON DELETE CASCADE 
            )`, (err) => {
                if (err) { console.error("Error creating 'card_sets' table:", err.message); }
                else { console.log("'card_sets' table created or already exists."); }
            });

            // Rarities Table
            db.run(`CREATE TABLE IF NOT EXISTS rarities (
                id TEXT NOT NULL,                     
                name TEXT NOT NULL,                   
                color_class TEXT,                 
                set_id TEXT NOT NULL,                 
                PRIMARY KEY (set_id, id),             
                FOREIGN KEY (set_id) REFERENCES card_sets(id) ON DELETE CASCADE
            )`, (err) => {
                if (err) { console.error("Error creating 'rarities' table:", err.message); }
                else { console.log("'rarities' table created or already exists."); }
            });

            // Products Table
            db.run(`CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY UNIQUE,      
                name TEXT NOT NULL,              
                type TEXT NOT NULL,              
                set_id TEXT NOT NULL,            
                cards_per_pack INTEGER,
                pack_product_id TEXT,            
                packs_per_box INTEGER,
                box_guarantees_json TEXT,        
                box_product_id TEXT,             
                boxes_per_case INTEGER,
                case_guarantees_json TEXT,       
                FOREIGN KEY (set_id) REFERENCES card_sets(id) ON DELETE CASCADE,
                FOREIGN KEY (pack_product_id) REFERENCES products(id) ON DELETE SET NULL, 
                FOREIGN KEY (box_product_id) REFERENCES products(id) ON DELETE SET NULL
            )`, (err) => {
                if (err) { console.error("Error creating 'products' table:", err.message); }
                else { console.log("'products' table created or already exists."); }
            });

            // Pack Slot Configurations Table
            db.run(`CREATE TABLE IF NOT EXISTS pack_slot_configurations (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                product_id TEXT NOT NULL,            
                slot_index INTEGER NOT NULL,         
                type TEXT NOT NULL,                  
                count INTEGER NOT NULL,              
                fixed_rarity_id TEXT,                
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                UNIQUE (product_id, slot_index)      
            )`, (err) => {
                if (err) { console.error("Error creating 'pack_slot_configurations' table:", err.message); }
                else { console.log("'pack_slot_configurations' table created or already exists."); }
            });

            // Pack Slot Pool Items Table
            db.run(`CREATE TABLE IF NOT EXISTS pack_slot_pool_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slot_config_id INTEGER NOT NULL,     
                rarity_id TEXT NOT NULL,             
                weight INTEGER NOT NULL,
                FOREIGN KEY (slot_config_id) REFERENCES pack_slot_configurations(id) ON DELETE CASCADE
            )`, (err) => {
                if (err) { console.error("Error creating 'pack_slot_pool_items' table:", err.message); }
                else { console.log("'pack_slot_pool_items' table created or already exists."); }
            });
			
			db.run(`CREATE TABLE IF NOT EXISTS guarantee_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    scope TEXT NOT NULL CHECK(scope IN ('box', 'case')), -- 'box' or 'case'
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`, (err) => {
    if (err) console.error("Error creating guarantee_templates table", err.message);
    else console.log("guarantee_templates table ready.");
});

db.run(`CREATE TABLE IF NOT EXISTS guarantee_template_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    rule_json TEXT NOT NULL, -- Stores a single complete rule object as JSON
    sort_order INTEGER DEFAULT 0, -- Optional: if rule order matters
    FOREIGN KEY (template_id) REFERENCES guarantee_templates (id) ON DELETE CASCADE
)`, (err) => {
    if (err) console.error("Error creating guarantee_template_rules table", err.message);
    else console.log("guarantee_template_rules table ready.");
});
            
            // Cards Table
            db.run(`CREATE TABLE IF NOT EXISTS cards (
                id TEXT NOT NULL,                     
                name TEXT NOT NULL,
                image_url TEXT,
                market_price REAL DEFAULT 0,          
                card_number TEXT,                     
                set_id TEXT NOT NULL,                 
                rarity_id TEXT NOT NULL,              
                PRIMARY KEY (set_id, id),             
                FOREIGN KEY (set_id) REFERENCES card_sets(id) ON DELETE CASCADE,
                FOREIGN KEY (set_id, rarity_id) REFERENCES rarities(set_id, id) ON DELETE RESTRICT 
            )`, (err) => {
                if (err) {
                    console.error("Error creating 'cards' table:", err.message);
                } else {
                    console.log("'cards' table created or already exists.");
                }
            });
        });
    }
});

module.exports = db;
