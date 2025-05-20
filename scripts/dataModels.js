// --- DATA STRUCTURES (Client-side representation) ---
class TCGDatabase {
    constructor() { this.tcgs = []; }
    addTCG(tcg) { if (!this.getTCGById(tcg.id)) { this.tcgs.push(tcg); return true; } else { console.warn(`TCG ${tcg.id} exists.`); return false; } }
    getTCGById(id) { return this.tcgs.find(t => t.id === id); }
    static fromPlainObject(plainDB) {
        const db = new TCGDatabase();
        if (plainDB && plainDB.tcgs && Array.isArray(plainDB.tcgs)) {
            db.tcgs = plainDB.tcgs.map(plainTcg => TCG.fromPlainObject(plainTcg));
        } else { db.tcgs = []; }
        return db;
    }
}
class TCG {
    constructor(id, name) { this.id = id; this.name = name; this.sets = []; }
    addSet(set) { if (!this.getSetById(set.id)) { this.sets.push(set); return true; } else { console.warn(`Set ${set.id} exists.`); return false; } }
    getSetById(id) { return this.sets.find(s => s.id === id); }
    static fromPlainObject(plainTcg) {
        const tcg = new TCG(plainTcg.id, plainTcg.name);
        if (plainTcg && plainTcg.sets && Array.isArray(plainTcg.sets)) {
            tcg.sets = plainTcg.sets.map(plainSet => CardSet.fromPlainObject(plainSet, tcg.id));
        } else { tcg.sets = []; }
        return tcg;
    }
}
class CardSet {
    constructor(id, name, tcgId) {
        this.id = id; this.name = name; this.tcg_id = tcgId;
        this.rarities = []; this.cards = []; this.products = [];
    }
    addRarity(rarity) { if (!this.getRarityById(rarity.id)) { this.rarities.push(rarity); return true; } return false; }
    removeRarity(rarityId) { const i = this.rarities.findIndex(r => r.id === rarityId); if (i > -1) { this.rarities.splice(i, 1); return true; } return false; }
    getRarityById(id) { return this.rarities.find(r => r.id === id); }
    addProduct(product) { if (!this.getProductById(product.id)) { this.products.push(product); return true; } return false; }
    removeProduct(productId) { const i = this.products.findIndex(p => p.id === productId); if (i > -1) { this.products.splice(i, 1); return true; } return false; }
    getProductById(id) { return this.products.find(p => p.id === id); }
    addCard(card) { if (!this.getCardById(card.id)) { this.cards.push(card); return true; } console.warn(`Card ${card.id} exists in set ${this.id}.`); return false; }
    removeCard(cardId) {
        const initialLength = this.cards.length;
        this.cards = this.cards.filter(card => card.id !== cardId);
        return this.cards.length < initialLength; // Returns true if a card was actually removed
    }
    getCardById(id) { return this.cards.find(c => c.id === id); }
    static fromPlainObject(plainSet, tcgId) {
        const set = new CardSet(plainSet.id, plainSet.name, plainSet.tcg_id || tcgId);
        if (plainSet.rarities && Array.isArray(plainSet.rarities)) { set.rarities = plainSet.rarities.map(r => Rarity.fromPlainObject(r)); }
        if (plainSet.products && Array.isArray(plainSet.products)) { set.products = plainSet.products.map(p => Product.fromPlainObject(p, set.id)); }
        if (plainSet.cards && Array.isArray(plainSet.cards)) { set.cards = plainSet.cards.map(c => Card.fromPlainObject(c, set.id)); }
        return set;
    }
}
class Rarity {
    constructor(id, name, color_class, set_id) { // Added set_id to constructor
        this.id = id;
        this.name = name;
        this.color_class = color_class;
        this.set_id = set_id; // Store set_id
    }
    static fromPlainObject(plainRarity) {
        // Ensure plainRarity.set_id is passed to the constructor
        return new Rarity(plainRarity.id, plainRarity.name, plainRarity.color_class, plainRarity.set_id);
    }
}
class Card {
    constructor(id, name, rarity_id, set_id, image_url = '', market_price = 0, card_number = '') {
        this.id = id;
        this.name = name;
        this.rarity_id = rarity_id;
        this.set_id = set_id;
        this.image_url = image_url;
        this.market_price = parseFloat(market_price) || 0;
        this.card_number = card_number || id;
        this.rarity_name = '';
        this.rarity_color_class = '';
    }
    static fromPlainObject(plainCard, setId) {
        const card = new Card(
            plainCard.id, plainCard.name, plainCard.rarity_id,
            plainCard.set_id || setId, plainCard.image_url,
            plainCard.market_price, plainCard.card_number
        );
        if (plainCard.rarity_name) card.rarity_name = plainCard.rarity_name;
        if (plainCard.rarity_color_class) card.rarity_color_class = plainCard.rarity_color_class;
        return card;
    }
}
class Product {
    constructor(id, name, type, setId, details = {}) {
        this.id = id; this.name = name; this.type = type; this.set_id = setId;

        if (type === 'pack') {
            this.cards_per_pack = details.cards_per_pack || 0;
            this.slotConfiguration = details.slotConfiguration || [];
        } else if (type === 'box') {
            this.pack_product_id = details.pack_product_id || '';
            this.packs_per_box = details.packs_per_box || 0;
            this.box_guarantees_config = details.box_guarantees || { rules: [], notes: "" };
        } else if (type === 'case') {
            this.box_product_id = details.box_product_id || '';
            this.boxes_per_case = details.boxes_per_case || 0;
            this.case_guarantees_config = details.case_guarantees || { rules: [], notes: "" };
        }
    }
    static fromPlainObject(plainProduct, setId) {
        let parsedBoxGuarantees = { rules: [], notes: "" };
        if (typeof plainProduct.box_guarantees_json === 'string' && plainProduct.box_guarantees_json.trim()) {
            try { parsedBoxGuarantees = JSON.parse(plainProduct.box_guarantees_json); }
            catch (e) { console.error(`Error parsing box_guarantees_json for ${plainProduct.id}:`, e, plainProduct.box_guarantees_json); }
        } else if (plainProduct.box_guarantees && typeof plainProduct.box_guarantees === 'object') {
            parsedBoxGuarantees = plainProduct.box_guarantees;
        }

        let parsedCaseGuarantees = { rules: [], notes: "" };
        if (typeof plainProduct.case_guarantees_json === 'string' && plainProduct.case_guarantees_json.trim()) {
            try { parsedCaseGuarantees = JSON.parse(plainProduct.case_guarantees_json); }
            catch (e) { console.error(`Error parsing case_guarantees_json for ${plainProduct.id}:`, e, plainProduct.case_guarantees_json); }
        } else if (plainProduct.case_guarantees && typeof plainProduct.case_guarantees === 'object') {
            parsedCaseGuarantees = plainProduct.case_guarantees;
        }

        const details = {
            cards_per_pack: plainProduct.cards_per_pack,
            slotConfiguration: plainProduct.slotConfiguration || [],
            pack_product_id: plainProduct.pack_product_id,
            packs_per_box: plainProduct.packs_per_box,
            box_guarantees: parsedBoxGuarantees,
            box_product_id: plainProduct.box_product_id,
            boxes_per_case: plainProduct.boxes_per_case,
            case_guarantees: parsedCaseGuarantees
        };
        if (plainProduct.type === 'pack' && !Array.isArray(details.slotConfiguration)) {
            details.slotConfiguration = [];
        }
        return new Product(plainProduct.id, plainProduct.name, plainProduct.type, plainProduct.set_id || setId, details);
    }
}