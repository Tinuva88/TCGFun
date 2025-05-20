// scripts/simulatorApp.js

// --- Global State for Simulator (Client-Side) ---
const simState = {
    allTcgs: [],
    allSets: [],        // Sets for the currently selected TCG
    allProducts: [],    // Products for the currently selected Set (includes packs, boxes, cases)
    allCardsInSet: [],  // Cards for the currently selected Set
    allRaritiesInSet: [],// Rarities for the currently selected Set

    activeTcgId: null,
    activeSetId: null,
    activePackProductId: null, // ID of the pack to open (e.g., 'OP01-PACK-EN')
    activePackData: null,      // Holds the full data for the pack to be opened

    userCurrency: 1000, // Starting currency
    // Collection will be managed by collectionManager.js
};

// --- DOM Elements (declared here, assigned in initSimulator) ---
let simTcgSelect, simSetSelect, openPackButton,
    packDisplayArea, collectionDisplayArea,
    userCurrencyDisplay, collectionUniqueCount, collectionTotalCount,
    simStatusMessageEl, // For uiManager.showStatus, if used from the editor's uiManager
    clearCollectionButton;

// This is a global variable that uiManager.js might expect if we're reusing it.
// If uiManager.js is not used or has its own status element, this can be removed.
let statusMessageEl;


// --- Initialization ---
async function initSimulator() {
    console.log("Simulator Initializing...");

    // Assign DOM Elements
    simTcgSelect = document.getElementById('simTcgSelect');
    simSetSelect = document.getElementById('simSetSelect');
    openPackButton = document.getElementById('openPackButton');
    packDisplayArea = document.getElementById('packDisplayArea');
    collectionDisplayArea = document.getElementById('collectionDisplayArea');
    userCurrencyDisplay = document.getElementById('userCurrencyDisplay');
    collectionUniqueCount = document.getElementById('collectionUniqueCount');
    collectionTotalCount = document.getElementById('collectionTotalCount');
    simStatusMessageEl = document.getElementById('simStatusMessage');
    clearCollectionButton = document.getElementById('clearCollectionButton');

    // Make simStatusMessageEl available for uiManager.showStatus if it's being reused
    statusMessageEl = simStatusMessageEl; // Assign to the global var uiManager might expect

    // Attach Event Listeners
    simTcgSelect?.addEventListener('change', handleTcgSelectChange);
    simSetSelect?.addEventListener('change', handleSetSelectChange);
    openPackButton?.addEventListener('click', handleOpenPackClick);
    clearCollectionButton?.addEventListener('click', handleClearCollection);

    // Initial Load
    await loadTcgsForSimulator();
    collectionManager.loadCollection(); // Load collection from localStorage
    updateCollectionDisplay();
    updateCurrencyDisplay();
    if (uiManager && typeof uiManager.showStatus === 'function') {
        uiManager.showStatus("Simulator ready. Select a TCG.", "info", 3000);
    } else {
        simStatusMessageEl.textContent = "Simulator ready. Select a TCG.";
    }
}

// --- Data Loading & UI Updates ---
async function loadTcgsForSimulator() {
    if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus("Loading TCGs...", "info", 0);
    else simStatusMessageEl.textContent = "Loading TCGs...";

    try {
        const tcgs = await apiService.fetchTcgs();
        simState.allTcgs = tcgs.map(t => TCG.fromPlainObject(t));

        simTcgSelect.innerHTML = '<option value="">-- Select TCG --</option>';
        simState.allTcgs.forEach(tcg => {
            const option = document.createElement('option');
            option.value = tcg.id;
            option.textContent = tcg.name;
            simTcgSelect.appendChild(option);
        });
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus("TCGs loaded. Please select one.", "success", 3000);
        else simStatusMessageEl.textContent = "TCGs loaded. Please select one.";

    } catch (error) {
        console.error("Error loading TCGs for simulator:", error);
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Error loading TCGs: ${error.message}`, "error");
        else simStatusMessageEl.textContent = `Error loading TCGs: ${error.message}`;
    }
}

async function handleTcgSelectChange(event) {
    simState.activeTcgId = event.target.value;
    simState.activeSetId = null;
    simState.activePackProductId = null;
    simState.activePackData = null;
    simState.allSets = [];
    simState.allProducts = [];
    simState.allCardsInSet = [];
    simState.allRaritiesInSet = [];


    simSetSelect.innerHTML = '<option value="">-- Select TCG First --</option>';
    simSetSelect.disabled = true;
    openPackButton.disabled = true;
    openPackButton.textContent = "Open Pack"; // Reset button text
    packDisplayArea.innerHTML = '<p class="text-slate-400">Select TCG and Set to open packs.</p>';

    if (!simState.activeTcgId) {
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus("TCG selection cleared.", "info");
        else simStatusMessageEl.textContent = "TCG selection cleared.";
        return;
    }

    if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Loading sets for ${simState.activeTcgId}...`, "info", 0);
    else simStatusMessageEl.textContent = `Loading sets for ${simState.activeTcgId}...`;

    try {
        const setsData = await apiService.fetchSetsForTcg(simState.activeTcgId);
        const currentTcg = simState.allTcgs.find(t => t.id === simState.activeTcgId);
        if (currentTcg) {
            currentTcg.sets = setsData.map(s => CardSet.fromPlainObject(s, simState.activeTcgId));
            simState.allSets = currentTcg.sets;
        } else { // Should not happen if allTcgs is populated correctly
            simState.allSets = setsData.map(s => CardSet.fromPlainObject(s, simState.activeTcgId));
        }

        simSetSelect.innerHTML = '<option value="">-- Select Set --</option>';
        simState.allSets.forEach(set => {
            const option = document.createElement('option');
            option.value = set.id;
            option.textContent = set.name;
            simSetSelect.appendChild(option);
        });
        simSetSelect.disabled = false;
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus("Sets loaded. Please select a set.", "success", 3000);
        else simStatusMessageEl.textContent = "Sets loaded. Please select a set.";
    } catch (error) {
        console.error("Error loading sets for simulator:", error);
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Error loading sets: ${error.message}`, "error");
        else simStatusMessageEl.textContent = `Error loading sets: ${error.message}`;
    }
}

async function handleSetSelectChange(event) {
    simState.activeSetId = event.target.value;
    simState.activePackProductId = null;
    simState.activePackData = null;
    openPackButton.disabled = true;
    openPackButton.textContent = "Open Pack";
    packDisplayArea.innerHTML = '<p class="text-slate-400">Set selected. Loading set data...</p>';

    if (!simState.activeSetId) {
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus("Set selection cleared.", "info");
        else simStatusMessageEl.textContent = "Set selection cleared.";
        return;
    }

    if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Loading data for set ${simState.activeSetId}...`, "info", 0);
    else simStatusMessageEl.textContent = `Loading data for set ${simState.activeSetId}...`;

    try {
        const [productsData, cardsData, raritiesData] = await Promise.all([
            apiService.fetchProductsForSet(simState.activeSetId),
            apiService.fetchCardsForSet(simState.activeSetId),
            apiService.fetchRaritiesForSet(simState.activeSetId)
        ]);

        simState.allProducts = productsData.map(p => Product.fromPlainObject(p, simState.activeSetId));
        simState.allCardsInSet = cardsData.map(c => Card.fromPlainObject(c, simState.activeSetId));
        simState.allRaritiesInSet = raritiesData.map(r => Rarity.fromPlainObject(r)); // Rarity model doesn't need setId here

        // For this phase, let's find the first available 'pack' type product in the set
        // In the future, this could populate a "shop" area with available packs from simState.allProducts
        const firstAvailablePack = simState.allProducts.find(p => p.type === 'pack');

        if (firstAvailablePack) {
            simState.activePackProductId = firstAvailablePack.id;
            simState.activePackData = firstAvailablePack; // Store full pack data
            openPackButton.textContent = `Open ${firstAvailablePack.name}`; // We'll add cost later
            openPackButton.disabled = false;
            if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Ready to open ${firstAvailablePack.name}!`, "success");
            else simStatusMessageEl.textContent = `Ready to open ${firstAvailablePack.name}!`;
        } else {
            if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`No pack products found for set ${simState.activeSetId}.`, "warning");
            else simStatusMessageEl.textContent = `No pack products found for set ${simState.activeSetId}.`;
            openPackButton.textContent = "No Packs Available";
        }
    } catch (error) {
        console.error("Error loading set data for simulator:", error);
        if (uiManager && typeof uiManager.showStatus === 'function') uiManager.showStatus(`Error loading set data: ${error.message}`, "error");
        else simStatusMessageEl.textContent = `Error loading set data: ${error.message}`;
    }
}

// --- Pack Opening & Collection Logic ---
async function handleOpenPackClick() {
    if (!simState.activePackData || !simState.activeSetId || !simState.allCardsInSet || simState.allCardsInSet.length === 0) {
        uiManager.showStatus("Cannot open pack: Set or Pack not properly selected or card data missing.", "error");
        return;
    }

    const packToOpen = simState.activePackData;

    // TODO: Implement currency deduction later
    // if (simState.userCurrency < packCost) { uiManager.showStatus("Not enough currency!", "error"); return; }
    // simState.userCurrency -= packCost;
    // updateCurrencyDisplay();

    uiManager.showStatus(`Opening ${packToOpen.name}...`, "info", 0);
    packDisplayArea.innerHTML = '<p class="text-slate-400 animate-pulse">Shuffling... opening...</p>';

    try {
        // Delay slightly for perceived opening animation
        await new Promise(resolve => setTimeout(resolve, 500));

        const pulledCards = await packOpener.openSinglePack(packToOpen, simState.allCardsInSet, simState.allRaritiesInSet);
        
        packDisplayArea.innerHTML = ''; // Clear "opening..." message
        if (pulledCards && pulledCards.length > 0) {
            pulledCards.forEach(card => {
                const cardEl = document.createElement('div');
                cardEl.className = 'sim-card-item p-2 text-center'; // Adjusted styling
                
                const rarityInfo = simState.allRaritiesInSet.find(r => r.id === card.rarity_id);
                const rarityName = rarityInfo ? rarityInfo.name : card.rarity_id;
                const rarityColor = rarityInfo ? rarityInfo.color_class : 'bg-gray-400 text-black';

                // Simple card display, can be enhanced with images later
                cardEl.innerHTML = `
                    ${card.image_url ? `<img src="${card.image_url}" alt="${card.name}" class="h-32 mx-auto mb-1 border border-gray-600 rounded" onerror="this.style.display='none'; this.parentElement.querySelector('.sim-card-name').classList.add('mt-2');">` : ''}
                    <p class="font-semibold sim-card-name">${card.name}</p>
                    <p class="text-xs"><span class="${rarityColor} px-1.5 py-0.5 text-xs rounded">${rarityName}</span></p>
                    <p class="text-xs text-gray-400">${card.id}</p>
                `;
                packDisplayArea.appendChild(cardEl);
                collectionManager.addCardToCollection(card);
            });
            uiManager.showStatus(`Opened ${packToOpen.name}! You got ${pulledCards.length} cards.`, "success");
        } else {
            packDisplayArea.innerHTML = '<p class="text-red-400">Pack was empty or an error occurred during opening.</p>';
            uiManager.showStatus("Pack opening resulted in no cards.", "warning");
        }
        updateCollectionDisplay();
        updateCurrencyDisplay(); // Update currency in case it was spent
    } catch (error) {
        console.error("Error opening pack:", error);
        packDisplayArea.innerHTML = `<p class="text-red-400">Error opening pack: ${error.message}</p>`;
        uiManager.showStatus(`Pack opening failed: ${error.message}`, "error");
    }
}

function updateCollectionDisplay() {
    if (!collectionDisplayArea || !collectionManager) return;
    const collection = collectionManager.getCollection();
    collectionDisplayArea.innerHTML = '';
    let uniqueCount = 0;
    let totalCount = 0;

    const sortedCardIds = Object.keys(collection).sort((a,b) => {
        // Optional: Sort collection display, e.g., by card ID or name
        return collection[a].name.localeCompare(collection[b].name) || a.localeCompare(b);
    });

    if (sortedCardIds.length === 0) {
        collectionDisplayArea.innerHTML = '<p class="text-slate-400">Your collection is empty.</p>';
    } else {
        sortedCardIds.forEach(cardId => {
            uniqueCount++;
            const cardItem = collection[cardId];
            totalCount += cardItem.quantity;

            const cardEl = document.createElement('div');
            cardEl.className = 'sim-card-item p-2 w-full'; // Stack vertically
            
            const rarityInfo = simState.allRaritiesInSet.find(r => r.id === cardItem.rarity_id); // Try to get full rarity info
            const rarityName = rarityInfo ? rarityInfo.name : cardItem.rarity_id;
            const rarityColor = rarityInfo ? rarityInfo.color_class : 'bg-gray-400 text-black';

            cardEl.innerHTML = `
                <div class="flex justify-between items-center">
                    <span class="font-semibold">${cardItem.name}</span>
                    <span class="text-sm text-indigo-300">x${cardItem.quantity}</span>
                </div>
                <div class="text-xs">
                    <span class="text-gray-400">ID: ${cardId} | </span>
                    <span class="${rarityColor} px-1 py-0.5 rounded text-xs">${rarityName}</span>
                </div>
            `;
            collectionDisplayArea.appendChild(cardEl);
        });
    }
    if (collectionUniqueCount) collectionUniqueCount.textContent = uniqueCount;
    if (collectionTotalCount) collectionTotalCount.textContent = totalCount;
}

function handleClearCollection() {
    if (confirm("Are you sure you want to clear your entire collection? This will reset your progress.")) {
        collectionManager.clearCollection();
        updateCollectionDisplay();
        uiManager.showStatus("Collection cleared.", "success");
    }
}

function updateCurrencyDisplay() {
    if (userCurrencyDisplay) userCurrencyDisplay.textContent = `$${simState.userCurrency}`;
}

// --- Wait for DOM to load ---
document.addEventListener('DOMContentLoaded', initSimulator);