// scripts/packOpener.js

const packOpener = {
    /**
     * Opens a single pack based on its configuration and the available cards in the set.
     * @param {object} packProductData - The product object for the pack (must include slotConfiguration, cards_per_pack).
     * @param {Array<object>} allCardsInSet - Array of all Card objects available in this set.
     * @param {Array<object>} allRaritiesInSet - Array of all Rarity objects for this set (used for context/logging if needed).
     * @returns {Promise<Array<object>>} A promise that resolves to an array of pulled card objects.
     */
    openSinglePack: async function(packProductData, allCardsInSet, allRaritiesInSet) {
        console.log("PackOpener: Starting to open pack:", packProductData.name);
        uiManager.showStatus(`Simulating opening ${packProductData.name}...`, "info", 0);


        if (!packProductData || !allCardsInSet || allCardsInSet.length === 0) {
            console.error("PackOpener: Insufficient data. PackData:", packProductData, "CardsInSet:", allCardsInSet);
            throw new Error("Pack data or card list for the set is missing or empty.");
        }

        const pulledCards = [];
        // Create a mutable copy of allCardsInSet to avoid pulling the exact same card instance multiple times if not desired
        // For simplicity in this version, we'll allow the same card to be picked if the pool allows (e.g. multiple commons)
        // True "unique pulls per pack" would require removing from a temporary pool.

        const slotConfig = packProductData.slotConfiguration;
        const expectedCards = parseInt(packProductData.cards_per_pack) || 0;

        if (!slotConfig || slotConfig.length === 0) {
            if (expectedCards > 0) {
                console.warn(`PackOpener: Pack ${packProductData.id} has no slot configuration but expects ${expectedCards} cards. Pulling random cards from the entire set.`);
                for (let i = 0; i < expectedCards; i++) {
                    if (allCardsInSet.length > 0) {
                        const randomCard = this._getRandomCardFromList(allCardsInSet);
                        if (randomCard) pulledCards.push(randomCard);
                    }
                }
                return pulledCards;
            } else {
                console.warn(`PackOpener: Pack ${packProductData.id} has no slot configuration and no cards_per_pack defined. Returning empty.`);
                return [];
            }
        }

        // Process slots
        for (const slot of slotConfig) {
            if (!slot.type || !slot.count) {
                console.warn("PackOpener: Invalid slot definition found, skipping:", slot);
                continue;
            }

            for (let i = 0; i < slot.count; i++) {
                // Optional: Stop if we've already reached the total cards_per_pack for some reason
                // if (expectedCards > 0 && pulledCards.length >= expectedCards) break;

                let potentialPulls = [];
                let chosenRarityIdForSlot = null;

                if (slot.type === 'fixed') {
                    chosenRarityIdForSlot = slot.fixed_rarity_id; // From DB: fixed_rarity_id
                    if (!chosenRarityIdForSlot) {
                        console.warn(`PackOpener: Fixed slot in pack ${packProductData.id} is missing fixed_rarity_id.`, slot);
                        continue;
                    }
                    potentialPulls = allCardsInSet.filter(card => card.rarity_id === chosenRarityIdForSlot);
                } else if (slot.type === 'pool') {
                    if (slot.pool && slot.pool.length > 0) {
                        chosenRarityIdForSlot = this._getWeightedRandomRarityFromPool(slot.pool);
                        if (chosenRarityIdForSlot) {
                            potentialPulls = allCardsInSet.filter(card => card.rarity_id === chosenRarityIdForSlot);
                        } else {
                            console.warn(`PackOpener: Could not determine rarity from pool for slot in pack ${packProductData.id}. Pool:`, slot.pool);
                            // Fallback: maybe pick any card from the set if pool selection fails? Or skip. For now, skip.
                            continue;
                        }
                    } else {
                        console.warn(`PackOpener: Pool slot has no pool items in pack ${packProductData.id}.`, slot);
                        continue;
                    }
                } else {
                    console.warn(`PackOpener: Unknown slot type '${slot.type}' in pack ${packProductData.id}.`, slot);
                    continue;
                }

                if (potentialPulls.length > 0) {
                    const randomCard = this._getRandomCardFromList(potentialPulls);
                    if (randomCard) {
                        pulledCards.push(randomCard);
                    } else {
                        console.warn(`PackOpener: Could not select a random card from potential pulls for rarity '${chosenRarityIdForSlot}'. Pool size: ${potentialPulls.length}`);
                    }
                } else {
                    console.warn(`PackOpener: No cards found in set matching criteria for slot. Type: '${slot.type}', Rarity ID: '${chosenRarityIdForSlot || slot.fixed_rarity_id}', Pack: ${packProductData.id}`);
                    // Potentially add a placeholder or a "lesser" card if this happens, or just skip.
                }
            }
        }

        // If after processing slots, the number of cards is less than cards_per_pack,
        // you might want to add filler cards (e.g., random commons).
        // For now, we will return whatever the slots generated.
        if (expectedCards > 0 && pulledCards.length !== expectedCards) {
            console.warn(`PackOpener: Pack ${packProductData.name} generated ${pulledCards.length} cards, but expected ${expectedCards}. Slot configuration might not sum up to cards_per_pack.`);
        }
        
        console.log(`PackOpener: Pulled ${pulledCards.length} cards for pack ${packProductData.name}:`, pulledCards.map(c => ({id: c.id, name: c.name, rarity: c.rarity_id})));
        return pulledCards;
    },

    _getRandomCardFromList: function(cardList) {
        if (!cardList || cardList.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * cardList.length);
        return cardList[randomIndex];
    },

    _getWeightedRandomRarityFromPool: function(pool) { // pool is [{rarity_id: "C", weight: 10}, ...]
        let totalWeight = 0;
        pool.forEach(item => totalWeight += (item.weight || 0));

        if (totalWeight === 0) return null; // Avoid division by zero or infinite loop if all weights are 0

        let randomWeight = Math.random() * totalWeight;
        for (const item of pool) {
            if (randomWeight < (item.weight || 0)) {
                return item.rarity_id; // In your DB/Product model, this is rarity_id
            }
            randomWeight -= (item.weight || 0);
        }
        // Fallback, should ideally not be reached if weights are positive
        return pool.length > 0 ? pool[pool.length - 1].rarity_id : null;
    }
};