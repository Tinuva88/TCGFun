// scripts/collectionManager.js

const COLLECTION_STORAGE_KEY = 'tcgSimCollection';

const collectionManager = {
    _collection: {}, // Internal cache { card_id: { name, rarity_id, quantity, ...other_details_if_needed } }

    loadCollection: function() {
        const storedCollection = localStorage.getItem(COLLECTION_STORAGE_KEY);
        if (storedCollection) {
            this._collection = JSON.parse(storedCollection);
        } else {
            this._collection = {};
        }
        console.log("Collection loaded:", this._collection);
        return this._collection;
    },

    saveCollection: function() {
        localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(this._collection));
        console.log("Collection saved.");
    },

    addCardToCollection: function(cardObject) {
        if (!cardObject || !cardObject.id) {
            console.error("Invalid card object provided to addCardToCollection:", cardObject);
            return;
        }
        const cardId = cardObject.id;
        if (this._collection[cardId]) {
            this._collection[cardId].quantity++;
        } else {
            this._collection[cardId] = {
                name: cardObject.name,
                rarity_id: cardObject.rarity_id, // Store rarity_id for display/sorting
                // You might want to store other relevant card details from cardObject if needed for display
                // For example, image_url, set_id, etc. For now, keeping it simple.
                quantity: 1
            };
        }
        this.saveCollection();
    },

    getCollection: function() {
        return this._collection;
    },

    getCardCount: function(cardId) {
        return this._collection[cardId] ? this._collection[cardId].quantity : 0;
    },

    clearCollection: function() {
        this._collection = {};
        this.saveCollection();
        console.log("Collection cleared.");
    }
};