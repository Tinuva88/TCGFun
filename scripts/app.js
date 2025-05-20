// --- App State ---
let AppDB = new TCGDatabase();
const appState = {
    activeTCGId: null,
    activeSetId: null,
    activeProductId: null,
    activeProductForBoxGuarantees: null,
    activeProductForCaseGuarantees: null,
    activeRuleBeingEdited: { index: -1, data: null, scope: null },
    editingTcgId: null,
	editingSetId: null,
	editingRarityDetails: null,
	editingCardDetails: null,
	editingProductDetails: null
	//    activeRuleBeingEditedFor: null, // 'product' or 'template'
	//    activeRuleBeingEditedForTemplateContext: null, // { ruleIndex, scope }
};


// --- DOM Element Variables (Global within app.js scope after DOMContentLoaded) ---
// These will be assigned in DOMContentLoaded
let loadDataButton, exportDataButton, importDataInput, statusMessageEl,
    tcgListContainer, addTcgForm, newTcgIdInput, newTcgNameInput,
    setManagementSection, selectedTcgNameEl,
    setListContainer, addSetForm, newSetIdInput, newSetNameInput,
    rarityManagementSection, selectedSetNameForRarityEl,
    rarityListContainer, addRarityForm, newRarityIdInput, newRarityNameInput, newRarityColorClassInput,
    copyRaritiesSection, copySourceTcgSelect,
    copySourceSetSelect, copyRaritiesButton, productManagementSection,
    selectedSetNameForProductManagementEl, productListContainer, addProductForm,
    newProductIdInput, newProductNameInput,
    newProductTypeSelect, packSpecificFieldsDiv, newProductCardsPerPackInput,
    boxSpecificFieldsDiv, newProductPacksPerBoxInput, newProductPackProductIdInput, newProductBoxGuaranteesInput,
    caseSpecificFieldsDiv, newProductBoxesPerCaseInput, newProductBoxProductIdInput, newProductCaseGuaranteesInput,
    cardManagementSection, selectedSetNameForCardManagementEl, cardListContainer, addCardForm,
    newCardIdInput, newCardNameInput, newCardRarityIdSelect, newCardMarketPriceInput,
    newCardImageUrlInput, newCardCardNumberInput,
    packConfigEditorEl, editingProductNameEl, cardsPerPackInput,
    slotConfigurationContainer, addSlotButton, savePackConfigurationButton,
    boxGuaranteeEditorSection, editingBoxProductNameEl, boxNotesInput, boxGuaranteeRulesContainer, addNewBoxGuaranteeRuleButton, saveBoxGuaranteesButton, closeBoxGuaranteeEditorButton,
    caseGuaranteeEditorSection, editingCaseProductNameEl, caseNotesInput, caseGuaranteeRulesContainer, addNewCaseGuaranteeRuleButton, saveCaseGuaranteesButton, closeCaseGuaranteeEditorButton,
    guaranteeRuleFormModal, ruleFormTitle, editingRuleIndexInput, editingRuleScopeInput, ruleIdInput, ruleDescriptionInput, ruleTypeSelect,
    ruleCountFieldsContainer, ruleCountMinInput, ruleCountMaxInput, ruleCountExactInput, ruleCountTargetAverageInput,
    ruleTargetRarityIdsSelect, ruleTargetCardIdsInput,
    chaseRuleFieldsContainer, ruleChaseChanceInput, ruleChaseGuaranteedIfHitInput, ruleChaseAddsToTotalInput,
    boxTopperRuleFieldsContainer = document.getElementById('boxTopperRuleFieldsContainer'),
	ruleBTQuantityInput = document.getElementById('ruleBTQuantityInput'),
    cancelRuleFormButton, saveRuleFormButton, closeRuleFormButton,
	boxGuaranteeTemplateSelect, applyBoxGuaranteeTemplateButton,
    caseGuaranteeTemplateSelect, applyCaseGuaranteeTemplateButton;
	cardCsvImportInput, importCardsCsvButton, cardImportStatus;
	// let templateManagementSection, addEditTemplateFormContainer, /* ...and all others from templateManager.js list... */
	// let manageTemplatesButton; // For the button to show/hide the section

//
const appActions = {
    async loadAndPopulateGuaranteeTemplates(scope, selectElementId) {
        const selectElement = document.getElementById(selectElementId);
        if (!selectElement) {
            console.error(`Template select element '${selectElementId}' not found.`);
            return;
        }
        try {
            uiManager.showStatus(`Loading ${scope} guarantee templates...`, 'info', 0);
            const templates = await apiService.fetchGuaranteeTemplates(scope);
            uiManager.populateGuaranteeTemplateSelect(templates, selectElement);
            uiManager.showStatus(`${scope} guarantee templates loaded.`, 'success', 2000);
        } catch (error) {
            console.error(`Error loading ${scope} guarantee templates:`, error);
            uiManager.showStatus(`Failed to load ${scope} templates: ${error.message}`, 'error');
            uiManager.populateGuaranteeTemplateSelect([], selectElement); // Populate with empty/error message
        }
    },

    async handleApplyGuaranteeTemplate(scope) {
        let selectedTemplateId;
        let activeProductForGuarantees;
        let notesInputElement;
        let rulesContainerElement;
        let currentRaritiesForSet;

        const currentSet = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        currentRaritiesForSet = currentSet?.rarities || [];

        if (scope === 'box') {
            selectedTemplateId = boxGuaranteeTemplateSelect.value;
            activeProductForGuarantees = appState.activeProductForBoxGuarantees;
            notesInputElement = boxNotesInput;
            rulesContainerElement = boxGuaranteeRulesContainer;
        } else if (scope === 'case') {
            selectedTemplateId = caseGuaranteeTemplateSelect.value;
            activeProductForGuarantees = appState.activeProductForCaseGuarantees;
            notesInputElement = caseNotesInput;
            rulesContainerElement = caseGuaranteeRulesContainer;
        } else {
            console.error("Invalid scope for applying template:", scope);
            return;
        }

        if (!selectedTemplateId) {
            uiManager.showStatus("Please select a template to apply.", "warning");
            return;
        }
        if (!activeProductForGuarantees) {
            uiManager.showStatus("No active product to apply templates to. This shouldn't happen.", "error");
            return;
        }

        uiManager.showStatus(`Workspaceing template ${selectedTemplateId}...`, 'info', 0);
        try {
            const templateDetails = await apiService.fetchGuaranteeTemplateDetails(selectedTemplateId);
            if (templateDetails && templateDetails.rules) {
                // Apply to the correct guarantee config object
                const configToUpdate = (scope === 'box') ? activeProductForGuarantees.box_guarantees_config : activeProductForGuarantees.case_guarantees_config;

                configToUpdate.rules = JSON.parse(JSON.stringify(templateDetails.rules)); // Deep copy rules
                configToUpdate.notes = templateDetails.description || templateDetails.name || configToUpdate.notes || ""; // Use template description/name as notes

                if (notesInputElement) notesInputElement.value = configToUpdate.notes;
                uiManager.renderGuaranteeRuleList(configToUpdate.rules, rulesContainerElement, scope, currentRaritiesForSet);
                uiManager.showStatus(`Template '${templateDetails.name}' applied. Review and Save All Guarantees.`, 'success');
            } else {
                throw new Error("Template details or rules missing in response.");
            }
        } catch (error) {
            console.error(`Error applying template ${selectedTemplateId}:`, error);
            uiManager.showStatus(`Failed to apply template: ${error.message}`, 'error');
        }
    }
};

// --- Event Handlers and App Logic ---
async function handleLoadTCGs() {
    uiManager.showStatus('Loading TCGs from server...', 'info', 0);
    try {
        const tcgDataArray = await apiService.fetchTcgs();
        AppDB.tcgs = tcgDataArray.map(d => TCG.fromPlainObject(d));
        uiManager.renderTCGList(AppDB.tcgs);
        uiManager.populateCopySourceTCGSelect(AppDB.tcgs);
        uiManager.hideSetAndSubsequentSections(); // Resets selection
        appState.activeTCGId = null; appState.activeSetId = null; // Reset state
        uiManager.showStatus('TCGs loaded successfully.', 'success');
    } catch (e) {
        console.error("Error loading TCGs:", e);
        AppDB.tcgs = []; // Clear local data on error
        uiManager.renderTCGList(AppDB.tcgs); // Update UI to show empty list
        uiManager.showStatus(`Error loading TCGs: ${e.message}`, 'error');
    }
}

function handleExportData() {
    const jsonData = JSON.stringify(AppDB, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tcg_editor_appdb_backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    uiManager.showStatus('Current AppDB data exported.', 'success');
}

function handleImportData(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const plainDB = JSON.parse(e.target.result);
                AppDB = TCGDatabase.fromPlainObject(plainDB);
                uiManager.showStatus('Data imported to AppDB. Changes are local until saved to server via actions.', 'success');
                uiManager.renderTCGList(AppDB.tcgs);
                uiManager.hideSetAndSubsequentSections();
                uiManager.populateCopySourceTCGSelect(AppDB.tcgs);
                appState.activeTCGId = null; appState.activeSetId = null; // Reset state
            } catch (err) {
                console.error('Error importing JSON:', err);
                uiManager.showStatus('Error importing JSON: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = null; // Reset file input
    }
}

async function handleAddTcgFormSubmit(event) {
    event.preventDefault();
    const name = newTcgNameInput.value.trim();
    if (!name) {
        uiManager.showStatus("TCG Name is required.", "error");
        return;
    }

    if (appState.editingTcgId) { // ----- UPDATE existing TCG -----
        uiManager.showStatus(`Updating TCG '${name}'...`, 'info', 0);
        try {
            const updatedTcgData = await apiService.updateTcg(appState.editingTcgId, { name });
            const tcgIndex = AppDB.tcgs.findIndex(tcg => tcg.id === appState.editingTcgId);
            if (tcgIndex !== -1) {
                AppDB.tcgs[tcgIndex] = TCG.fromPlainObject(updatedTcgData); // Update local AppDB
            }
            uiManager.renderTCGList(AppDB.tcgs);
            uiManager.resetTcgForm();
            appState.editingTcgId = null; // Exit edit mode
            uiManager.showStatus(`TCG '${name}' updated successfully.`, 'success');
            uiManager.populateCopySourceTCGSelect(AppDB.tcgs); // Refresh TCGs in copy dropdown
        } catch (error) {
            console.error("Error updating TCG:", error);
            uiManager.showStatus(`Failed to update TCG: ${error.message}`, 'error');
        }
    } else { // ----- ADD new TCG -----
        const id = newTcgIdInput.value.trim();
        if (!id) { uiManager.showStatus("TCG ID is required for new TCG.", "error"); return; }
        if (!/^\S+$/.test(id)) { uiManager.showStatus("TCG ID cannot contain spaces.", "error"); return; }

        uiManager.showStatus(`Adding TCG '${name}'...`, 'info', 0);
        try {
            const newTcgData = await apiService.addTcg({ id, name });
            const newTCG = TCG.fromPlainObject(newTcgData);
            if (AppDB.addTCG(newTCG)) {
                uiManager.renderTCGList(AppDB.tcgs);
                uiManager.resetTcgForm(); // Use the new reset function
                uiManager.showStatus(`TCG '${name}' added successfully.`, 'success');
                uiManager.populateCopySourceTCGSelect(AppDB.tcgs);
            } else {
                // This case might be rare if API validation is primary
                uiManager.showStatus(`TCG '${name}' (ID: ${id}) already exists locally or could not be added.`, 'warning');
            }
        } catch (error) {
            console.error("Error adding TCG:", error);
            uiManager.showStatus(`Failed to add TCG: ${error.message}`, 'error');
             // If error was due to conflict (e.g. ID already exists on server)
            if (error.message && error.message.toLowerCase().includes("already exists")) {
               // Potentially just show error, user needs to change ID
            }
        }
    }
}

async function handleTcgListClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.classList.contains('select-tcg-button')) {
        // ... (existing logic for selecting TCG to manage sets) ...
        // Make sure to reset TCG edit mode if user selects a TCG to manage sets
        if (appState.editingTcgId) {
            uiManager.resetTcgForm();
            appState.editingTcgId = null;
        }
        appState.activeTCGId = button.dataset.tcgId;
        const tcgName = button.dataset.tcgName;
        if (selectedTcgNameEl) selectedTcgNameEl.textContent = tcgName;
        if (setManagementSection) setManagementSection.classList.remove('hidden');
        uiManager.hideRarityAndSubsequentSections();
        appState.activeSetId = null;

        uiManager.showStatus(`Loading sets for TCG: ${tcgName}...`, 'info', 0);
        try {
            const setDataArray = await apiService.fetchSetsForTcg(appState.activeTCGId);
            const parentTCG = AppDB.getTCGById(appState.activeTCGId);
            if (parentTCG) {
                parentTCG.sets = setDataArray.map(sD => CardSet.fromPlainObject(sD, appState.activeTCGId));
                uiManager.renderSetList(parentTCG.sets);
                uiManager.showStatus(`Sets for '${tcgName}' loaded. Select a set to manage its details.`, 'success');
            } else {
                uiManager.showStatus(`TCG ${appState.activeTCGId} not found in local AppDB.`, 'error');
            }
        } catch (error) {
            console.error(`Error loading sets for ${appState.activeTCGId}:`, error);
            if (setListContainer) setListContainer.innerHTML = `<p class="text-red-400">Error loading sets: ${error.message}</p>`;
            uiManager.showStatus(`Error loading sets: ${error.message}`, 'error');
        }

    } else if (button.classList.contains('edit-tcg-button')) { // Handle Edit TCG button
        const tcgId = button.dataset.tcgId;
        const tcgName = button.dataset.tcgName;
        appState.editingTcgId = tcgId;
        uiManager.prepareTcgFormForEdit(tcgId, tcgName);
        addTcgForm.scrollIntoView({ behavior: 'smooth' });
    }
}

async function handleAddSetFormSubmit(event) {
    event.preventDefault();
    const name = newSetNameInput.value.trim();
    if (!name) {
        uiManager.showStatus("Set Name is required.", "error");
        return;
    }

    if (appState.editingSetId) { // ----- UPDATE existing Set -----
        uiManager.showStatus(`Updating Set '${name}'...`, 'info', 0);
        try {
            const updatedSetData = await apiService.updateSet(appState.editingSetId, { name });
            const tcg = AppDB.getTCGById(appState.activeTCGId); // Assume activeTCGId is still relevant
            if (tcg) {
                const setIndex = tcg.sets.findIndex(s => s.id === appState.editingSetId);
                if (setIndex !== -1) {
                    // Retain tcg_id from existing client-side object if backend doesn't return it or if it's complex
                    const originalTcgId = tcg.sets[setIndex].tcg_id;
                    tcg.sets[setIndex] = CardSet.fromPlainObject({...updatedSetData, tcg_id: originalTcgId } , originalTcgId);
                }
                uiManager.renderSetList(tcg.sets);
            }
            uiManager.resetSetForm();
            appState.editingSetId = null; // Exit edit mode
            uiManager.showStatus(`Set '${name}' updated successfully.`, 'success');
            // If this set was being used in the "copy rarities" source, refresh that
            if (copySourceTcgSelect?.value === appState.activeTCGId) {
                 const sourceTcg = AppDB.getTCGById(copySourceTcgSelect.value);
                 uiManager.populateCopySourceSetSelect(sourceTcg?.sets || [], appState.activeSetId, appState.activeTCGId);
            }
        } catch (error) {
            console.error("Error updating Set:", error);
            uiManager.showStatus(`Failed to update Set: ${error.message}`, 'error');
        }

    } else { // ----- ADD new Set -----
        if (!appState.activeTCGId) { uiManager.showStatus("Please select a TCG first to add a set to.", "error"); return; }
        const tcg = AppDB.getTCGById(appState.activeTCGId);
        if (!tcg) { uiManager.showStatus("Selected TCG not found locally.", "error"); return; }

        const id = newSetIdInput.value.trim();
        if (!id) { uiManager.showStatus("Set ID is required for new set.", "error"); return; }
        if (!/^\S+$/.test(id)) { uiManager.showStatus("Set ID cannot contain spaces.", "error"); return; }

        uiManager.showStatus(`Adding set '${name}' to ${tcg.name}...`, 'info', 0);
        try {
            const newSetData = await apiService.addSet(appState.activeTCGId, { id, name });
            const newSet = CardSet.fromPlainObject(newSetData, appState.activeTCGId); // Ensure tcg_id is passed
            if (tcg.addSet(newSet)) {
                uiManager.renderSetList(tcg.sets);
                uiManager.resetSetForm();
                uiManager.showStatus(`Set '${name}' added to ${tcg.name}.`, 'success');
                if (appState.activeTCGId === copySourceTcgSelect?.value) {
                    const sourceTcg = AppDB.getTCGById(copySourceTcgSelect.value);
                    uiManager.populateCopySourceSetSelect(sourceTcg?.sets || [], appState.activeSetId, appState.activeTCGId);
                }
            } else {
                uiManager.showStatus(`Set '${name}' (ID: ${id}) already exists locally or could not be added.`, 'warning');
            }
        } catch (error) {
            console.error("Error adding set:", error);
            uiManager.showStatus(`Failed to add set: ${error.message}`, 'error');
        }
    }
}

async function handleSetListClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.classList.contains('select-set-button')) {
        if (appState.editingSetId) { // Reset set edit mode if a set is selected for details
            uiManager.resetSetForm();
            appState.editingSetId = null;
        }
        if (appState.editingRarityDetails) { // Reset rarity edit mode
             uiManager.resetRarityForm();
             appState.editingRarityDetails = null;
        }
        // Potentially reset other edit modes here too (card, product main details) if they are active

        appState.activeSetId = button.dataset.setId;
        const setName = decodeURIComponent(button.dataset.setName); // Decode the name

        // Update titles
        if(selectedSetNameForRarityEl) selectedSetNameForRarityEl.textContent = setName;
        if(selectedSetNameForProductManagementEl) selectedSetNameForProductManagementEl.textContent = setName;
        if(selectedSetNameForCardManagementEl) selectedSetNameForCardManagementEl.textContent = setName;

        // --- Crucial part for showing sections ---
        if(rarityManagementSection) rarityManagementSection.classList.remove('hidden');
        if(productManagementSection) productManagementSection.classList.remove('hidden'); // Show Products
        if(cardManagementSection) cardManagementSection.classList.remove('hidden');     // Show Cards
        // --- End crucial part ---

        // Hide deeper level editors that are not immediately needed after selecting a set
        if(packConfigEditorEl) packConfigEditorEl.classList.add('hidden');
        if(boxGuaranteeEditorSection) boxGuaranteeEditorSection.classList.add('hidden');
        if(caseGuaranteeEditorSection) caseGuaranteeEditorSection.classList.add('hidden');
        if(guaranteeRuleFormModal) guaranteeRuleFormModal.classList.add('hidden');

        appState.activeProductId = null;
        appState.activeProductForBoxGuarantees = null;
        appState.activeProductForCaseGuarantees = null;
        // Reset card editing state if a new set is selected
        appState.editingCardDetails = null;
        uiManager.resetCardForm(); // Ensure card form is also reset

        uiManager.showStatus(`Loading details for set: ${setName}...`, 'info', 0);
        const tcg = AppDB.getTCGById(appState.activeTCGId);
        const set = tcg?.getSetById(appState.activeSetId);

        if (!set) {
            uiManager.showStatus("Could not find selected set in local data.", "error");
            // Clear lists if set is not found
            if(rarityListContainer) uiManager.renderRarityList([]);
            if(productListContainer) uiManager.renderProductList([]);
            if(cardListContainer) uiManager.renderCardList([], []);
            if(newCardRarityIdSelect) uiManager.populateCardRaritySelect([]);
            return;
        }

        try {
            // Parallel fetching of set details
            const [rarityData, productData, cardData] = await Promise.all([
                apiService.fetchRaritiesForSet(appState.activeSetId),
                apiService.fetchProductsForSet(appState.activeSetId),
                apiService.fetchCardsForSet(appState.activeSetId)
            ]);

            set.rarities = rarityData.map(rD => Rarity.fromPlainObject(rD));
            uiManager.renderRarityList(set.rarities);
            uiManager.populateCardRaritySelect(set.rarities); // For the "Add Card" form

            set.products = productData.map(pD => Product.fromPlainObject(pD, appState.activeSetId));
            uiManager.renderProductList(set.products);

            set.cards = cardData.map(cD => Card.fromPlainObject(cD, appState.activeSetId));
            uiManager.renderCardList(set.cards, set.rarities); // Pass rarities for context

            uiManager.showStatus(`Details for set '${setName}' loaded.`, 'success');
        } catch (error) {
            console.error(`Error loading details for set ${appState.activeSetId}:`, error);
            uiManager.showStatus(`Error loading set details: ${error.message}`, 'error');
            if(rarityListContainer) uiManager.renderRarityList([]);
            if(productListContainer) uiManager.renderProductList([]);
            if(cardListContainer) uiManager.renderCardList([], []);
            if(newCardRarityIdSelect) uiManager.populateCardRaritySelect([]);
        }

    } else if (button.classList.contains('edit-set-button')) {
        // ... (your existing edit-set-button logic)
        const setId = button.dataset.setId;
        const setName = button.dataset.setName; // This will be URI encoded from uiManager
        appState.editingSetId = setId;
        uiManager.prepareSetFormForEdit(setId, setName); // uiManager will decode
        addSetForm.scrollIntoView({ behavior: 'smooth' });
    }
}

// Consider adding this to appActions if you have such an object
// or make it a standalone function in app.js
async function refreshCardListViewForCurrentSet() { // Ensure this function is defined
    if (!appState.activeTCGId || !appState.activeSetId) {
        console.log("refreshCardListViewForCurrentSet: No active TCG/Set.");
        return;
    }
    try {
        const tcg = AppDB.getTCGById(appState.activeTCGId);
        const set = tcg?.getSetById(appState.activeSetId);
        if (set) {
            uiManager.showStatus("Refreshing card list...", "info", 0);
            const cardData = await apiService.fetchCardsForSet(appState.activeSetId);
            set.cards = cardData.map(cD => Card.fromPlainObject(cD, appState.activeSetId));
            uiManager.renderCardList(set.cards, set.rarities || []); // Pass set.rarities
            uiManager.showStatus("Card list refreshed.", "success", 2000);
        }
    } catch (error) {
        console.error("Error refreshing card list:", error);
        uiManager.showStatus(`Error refreshing card list: ${error.message}`, "error");
    }
}

async function handleAddRarityFormSubmit(event) {
    event.preventDefault();
    const name = newRarityNameInput.value.trim();
    const color_class = newRarityColorClassInput.value.trim();

    if (!name || !color_class) {
        uiManager.showStatus("Rarity Name and Color Class are required.", "error");
        return;
    }

    if (appState.editingRarityDetails) { // ----- UPDATE existing Rarity -----
        const { setId, rarityId } = appState.editingRarityDetails;
        if (!setId || !rarityId) { // Should not happen if state is managed correctly
            uiManager.showStatus("Error: Editing context for rarity is missing.", "error");
            return;
        }

        uiManager.showStatus(`Updating Rarity '${name}'...`, 'info', 0);
        try {
            const updatedRarityData = await apiService.updateRarity(setId, rarityId, { name, color_class });
            const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(setId);
            if (set) {
                const rarityIndex = set.rarities.findIndex(r => r.id === rarityId);
                if (rarityIndex !== -1) {
                    set.rarities[rarityIndex] = Rarity.fromPlainObject(updatedRarityData);
                }
                uiManager.renderRarityList(set.rarities);
                uiManager.populateCardRaritySelect(set.rarities); // Update card form dropdown
            }
            uiManager.resetRarityForm();
            appState.editingRarityDetails = null; // Exit edit mode
            uiManager.showStatus(`Rarity '${name}' updated successfully.`, 'success');
        } catch (error) {
            console.error("Error updating Rarity:", error);
            uiManager.showStatus(`Failed to update Rarity: ${error.message}`, 'error');
        }
    } else { // ----- ADD new Rarity -----
        if (!appState.activeTCGId || !appState.activeSetId) { uiManager.showStatus("Please select a TCG and Set first.", "error"); return; }
        const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        if (!set) { uiManager.showStatus("Selected Set not found locally.", "error"); return; }

        const id = newRarityIdInput.value.trim();
        if (!id) { uiManager.showStatus("Rarity ID is required for new rarity.", "error"); return; }
        if (!/^\S+$/.test(id)) { uiManager.showStatus("Rarity ID cannot contain spaces.", "error"); return; }

        uiManager.showStatus(`Adding rarity '${name}'...`, 'info', 0);
        try {
            const newRarityData = await apiService.addRarity(appState.activeSetId, { id, name, color_class });
            const newRarity = Rarity.fromPlainObject(newRarityData);
            if (set.addRarity(newRarity)) {
                uiManager.renderRarityList(set.rarities);
                uiManager.resetRarityForm();
                uiManager.showStatus(`Rarity '${name}' added.`, 'success');
                uiManager.populateCardRaritySelect(set.rarities);
            } else {
                uiManager.showStatus(`Rarity '${name}' (ID: ${id}) already exists or could not be added locally.`, 'warning');
            }
        } catch (error) {
            console.error("Error adding rarity:", error);
            uiManager.showStatus(`Failed to add rarity: ${error.message}`, 'error');
        }
    }
}

async function handleRarityListClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.classList.contains('delete-rarity-button')) {
        if (!appState.activeTCGId || !appState.activeSetId) { uiManager.showStatus("No active Set selected.", "error"); return; }
        const rarityId = button.dataset.rarityId;
        if (!rarityId) { uiManager.showStatus("Rarity ID missing for deletion.", "error"); return; }

        if (confirm(`Are you sure you want to delete rarity '${rarityId}' from set '${appState.activeSetId}'?`)) {
            uiManager.showStatus(`Deleting rarity '${rarityId}'...`, 'info', 0);
            try {
                await apiService.deleteRarity(appState.activeSetId, rarityId);
                const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
                if (set && set.removeRarity(rarityId)) {
                    uiManager.renderRarityList(set.rarities);
                    uiManager.populateCardRaritySelect(set.rarities);
                    uiManager.showStatus(`Rarity '${rarityId}' deleted successfully.`, 'success');
                } else {
                    // If local removal failed but server might have succeeded, or vice-versa
                    uiManager.showStatus(`Rarity '${rarityId}' deletion processed. Reloading rarities for consistency.`, 'warning');
                    const updatedRarities = await apiService.fetchRaritiesForSet(appState.activeSetId);
                    if (set) set.rarities = updatedRarities.map(r => Rarity.fromPlainObject(r));
                    uiManager.renderRarityList(set?.rarities || []);
                    uiManager.populateCardRaritySelect(set?.rarities || []);
                }
            } catch (error) {
                console.error("Error deleting rarity:", error);
                uiManager.showStatus(`Failed to delete rarity '${rarityId}': ${error.message}`, 'error');
            }
        }
    } else if (button.classList.contains('edit-rarity-button')) { // This is the part for editing
        const rarityId = button.dataset.rarityId;
        const rarityName = button.dataset.rarityName; // Was encoded
        const rarityColorClass = button.dataset.rarityColorClass; // Was encoded
        const setIdFromButton = button.dataset.setId; // setId stored on the button

        // Ensure we're editing within the context of the currently active set
        if (appState.activeSetId !== setIdFromButton) {
            uiManager.showStatus("Set context mismatch for editing rarity. Please ensure the correct set is active.", "error");
            console.error("Set ID mismatch:", appState.activeSetId, "vs", setIdFromButton);
            return;
        }

        // Reset other edit modes if any
        if (appState.editingTcgId) { uiManager.resetTcgForm(); appState.editingTcgId = null;}
        if (appState.editingSetId) { uiManager.resetSetForm(); appState.editingSetId = null;}


        appState.editingRarityDetails = { setId: appState.activeSetId, rarityId: rarityId };
        uiManager.prepareRarityFormForEdit(rarityId, rarityName, rarityColorClass); // Pass decoded values if necessary (uiManager handles decode)
        addRarityForm.scrollIntoView({ behavior: 'smooth' });
    }
}

async function handleCopyRarities() {
    const sourceTcgId = copySourceTcgSelect.value;
    const sourceSetId = copySourceSetSelect.value;

    if (!appState.activeTCGId || !appState.activeSetId) { uiManager.showStatus("Please select a target Set first.", "error"); return; }
    if (!sourceSetId || !sourceTcgId) { uiManager.showStatus("Please select a Source TCG and Set.", "error"); return; }
    if (sourceSetId === appState.activeSetId && sourceTcgId === appState.activeTCGId) { uiManager.showStatus("Cannot copy rarities to the same set.", "warning"); return; }

    uiManager.showStatus(`Copying rarities from ${sourceSetId} to ${appState.activeSetId}...`, 'info', 0);
    try {
        const sourceRaritiesData = await apiService.fetchRaritiesForSet(sourceSetId);
        if (!sourceRaritiesData || sourceRaritiesData.length === 0) {
            uiManager.showStatus(`Source set '${sourceSetId}' has no rarities to copy.`, 'info');
            return;
        }

        const targetSet = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        if (!targetSet) { uiManager.showStatus("Target set not found locally.", "error"); return; }

        let copiedCount = 0; let skippedCount = 0; const errors = [];
        for (const rToCopy of sourceRaritiesData) {
            if (targetSet.getRarityById(rToCopy.id)) {
                skippedCount++;
                continue;
            }
            try {
                const addedRarityData = await apiService.addRarity(appState.activeSetId, { id: rToCopy.id, name: rToCopy.name, color_class: rToCopy.color_class });
                if (targetSet.addRarity(Rarity.fromPlainObject(addedRarityData))) {
                    copiedCount++;
                } else {
                    errors.push(`Rarity '${rToCopy.id}' added to server, but failed local AppDB update.`);
                }
            } catch (copyError) {
                errors.push(`Error copying rarity '${rToCopy.id}': ${copyError.message}`);
            }
        }

        // Refresh the rarity list for the target set
        const updatedRarities = await apiService.fetchRaritiesForSet(appState.activeSetId);
        targetSet.rarities = updatedRarities.map(r => Rarity.fromPlainObject(r));
        uiManager.renderRarityList(targetSet.rarities);
        uiManager.populateCardRaritySelect(targetSet.rarities);

        let finalMsg = `Copied ${copiedCount} rarities. Skipped ${skippedCount} (already exist).`;
        if (errors.length > 0) {
            finalMsg += ` Encountered ${errors.length} errors. Check console for details.`;
            console.error("Copy Rarity Errors:", errors);
            uiManager.showStatus(finalMsg, 'error');
        } else if (copiedCount > 0) {
            uiManager.showStatus(finalMsg, 'success');
        } else {
            uiManager.showStatus(finalMsg, 'info');
        }
    } catch (error) {
        console.error("Error copying rarities:", error);
        uiManager.showStatus(`Failed to copy rarities: ${error.message}`, 'error');
    }
}

async function handleAddProductFormSubmit(event) {
    event.preventDefault();
    if (!appState.activeTCGId || !appState.activeSetId) { uiManager.showStatus("Select TCG and Set first.", "error"); return; }

    const name = newProductNameInput.value.trim();
    const type = newProductTypeSelect.value; // This will be disabled (original type) in edit mode for details

    if (!name) { uiManager.showStatus("Product Name is required.", "error"); return; }

    if (appState.editingProductDetails) { // ----- UPDATE existing Product's Main Details -----
        const { productId, originalType, originalSlotConfiguration, originalBoxGuaranteesJson, originalCaseGuaranteesJson } = appState.editingProductDetails;

        // Type should not be changed in this edit mode, so it will be originalType
        if (type !== originalType) {
            uiManager.showStatus("Product type cannot be changed during this edit. Delete and re-add if type change is needed.", "error");
            // Or, you could allow type change, but it would need much more complex logic to handle associated data
            return;
        }

        let productDataToUpdate = {
            id: productId, // ID is not changed
            name: name,
            type: originalType, // Use original type
            set_id: appState.activeSetId,
            // Initialize complex fields with their original values from when edit mode started
            slotConfiguration: originalSlotConfiguration,
            box_guarantees_json: originalBoxGuaranteesJson,
            case_guarantees_json: originalCaseGuaranteesJson,
        };

        if (originalType === 'pack') {
            const cpp = parseInt(newProductCardsPerPackInput.value);
            if (newProductCardsPerPackInput.required && (isNaN(cpp) || cpp < 1)) {
                 uiManager.showStatus("Valid Cards Per Pack is required for packs.", "error"); return;
            }
            productDataToUpdate.cards_per_pack = cpp;
        } else if (originalType === 'box') {
            const ppb = parseInt(newProductPacksPerBoxInput.value);
            const ppi = newProductPackProductIdInput.value.trim();
            if ((newProductPacksPerBoxInput.required && (isNaN(ppb) || ppb < 1)) || (newProductPackProductIdInput.required && !ppi)) {
                uiManager.showStatus("Valid Packs Per Box and Contained Pack Product ID are required for boxes.", "error"); return;
            }
            productDataToUpdate.packs_per_box = ppb;
            productDataToUpdate.pack_product_id = ppi;
        } else if (originalType === 'case') {
            const bpc = parseInt(newProductBoxesPerCaseInput.value);
            const bpi = newProductBoxProductIdInput.value.trim();
            if ((newProductBoxesPerCaseInput.required && (isNaN(bpc) || bpc < 1)) || (newProductBoxProductIdInput.required && !bpi)) {
                uiManager.showStatus("Valid Boxes Per Case and Contained Box Product ID are required for cases.", "error"); return;
            }
            productDataToUpdate.boxes_per_case = bpc;
            productDataToUpdate.box_product_id = bpi;
        }

        uiManager.showStatus(`Updating Product '${name}'...`, 'info', 0);
        try {
            const updatedProductDataFromServer = await apiService.updateProduct(productId, productDataToUpdate);
            const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
            if (set) {
                const productIndex = set.products.findIndex(p => p.id === productId);
                if (productIndex !== -1) {
                    set.products[productIndex] = Product.fromPlainObject(updatedProductDataFromServer, appState.activeSetId);
                }
                uiManager.renderProductList(set.products);
            }
            uiManager.resetProductForm();
            appState.editingProductDetails = null; // Exit edit mode
            uiManager.showStatus(`Product '${name}' details updated successfully.`, 'success');
        } catch (error) {
            console.error("Error updating Product details:", error);
            uiManager.showStatus(`Failed to update Product details: ${error.message}`, 'error');
        }

    } else { // ----- ADD new Product -----
        const id = newProductIdInput.value.trim();
        if (!id) { uiManager.showStatus("Product ID is required for new product.", "error"); return; }
        if (!/^\S+$/.test(id)) { uiManager.showStatus("Product ID cannot contain spaces.", "error"); return; }
        if (!type) { uiManager.showStatus("Product Type is required.", "error"); return; }


        let productDataToAdd = { id, name, type, set_id: appState.activeSetId };

        if (type === 'pack') {
            // ... (existing add logic for pack specific fields)
            const cpp = parseInt(newProductCardsPerPackInput.value);
            if (newProductCardsPerPackInput.required && (isNaN(cpp) || cpp < 1)) { /* error */ return; }
            productDataToAdd.cards_per_pack = cpp;
            productDataToAdd.slotConfiguration = [];
        } else if (type === 'box') {
            // ... (existing add logic for box specific fields)
            const ppb = parseInt(newProductPacksPerBoxInput.value);
            const ppi = newProductPackProductIdInput.value.trim();
            if ((newProductPacksPerBoxInput.required && (isNaN(ppb) || ppb < 1)) || (newProductPackProductIdInput.required && !ppi)) { /* error */ return; }
            productDataToAdd.packs_per_box = ppb;
            productDataToAdd.pack_product_id = ppi;
            productDataToAdd.box_guarantees_json = JSON.stringify({ rules: [], notes: "" });
        } else if (type === 'case') {
            // ... (existing add logic for case specific fields)
            const bpc = parseInt(newProductBoxesPerCaseInput.value);
            const bpi = newProductBoxProductIdInput.value.trim();
            if ((newProductBoxesPerCaseInput.required && (isNaN(bpc) || bpc < 1)) || (newProductBoxProductIdInput.required && !bpi)) { /* error */ return; }
            productDataToAdd.boxes_per_case = bpc;
            productDataToAdd.box_product_id = bpi;
            productDataToAdd.case_guarantees_json = JSON.stringify({ rules: [], notes: "" });
        }
        // ... (rest of existing add product logic using apiService.addProduct) ...
        uiManager.showStatus(`Adding product '${name}'...`, 'info', 0);
        try {
            const newProductData = await apiService.addProduct(appState.activeSetId, productDataToAdd);
            const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
            if (set) {
                const newProduct = Product.fromPlainObject(newProductData, appState.activeSetId);
                if (set.addProduct(newProduct)) {
                    uiManager.renderProductList(set.products);
                    uiManager.resetProductForm(); // Use the general product form reset
                    uiManager.showStatus(`Product '${name}' added. Edit its guarantees/config if needed.`, 'success');
                } else {
                    uiManager.showStatus(`Product '${name}' (ID: ${id}) already exists locally or could not be added.`, 'warning');
                }
            }
        } catch (error) {
            console.error("Error adding product:", error);
            uiManager.showStatus(`Failed to add product: ${error.message}`, 'error');
        }
    }
}

async function handleProductListClick(event) {
    const button = event.target.closest('button');
    if (!button) return;

    const productId = button.dataset.productId;
    const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
    const product = set?.getProductById(productId); // Get the product from local AppDB
    const raritiesInSet = set?.rarities || [];

    if (button.classList.contains('edit-product-details-button')) {
        if (product) {
            // Reset other edit modes
            if(appState.editingTcgId) uiManager.resetTcgForm(); appState.editingTcgId = null;
            if(appState.editingSetId) uiManager.resetSetForm(); appState.editingSetId = null;
            if(appState.editingRarityDetails) uiManager.resetRarityForm(); appState.editingRarityDetails = null;
            if(appState.editingCardDetails) uiManager.resetCardForm(); appState.editingCardDetails = null;

            // Pass the full product object from AppDB to the form preparer
            uiManager.prepareProductFormForEdit(product);
            addProductForm.scrollIntoView({ behavior: 'smooth' });
        } else {
            uiManager.showStatus(`Product with ID ${productId} not found locally for editing.`, "error");
        }
    } else if (button.classList.contains('edit-pack-config-button')) {
        if (product) {
            appState.activeProductId = productId; // Set for pack config editor
            uiManager.displayPackConfigEditorUI(product, raritiesInSet);
        }
    } else if (button.classList.contains('edit-box-guarantees-button')) {
        if (product) uiManager.openBoxGuaranteeEditor(product, raritiesInSet);
    } else if (button.classList.contains('edit-case-guarantees-button')) {
        if (product) uiManager.openCaseGuaranteeEditor(product, raritiesInSet);
    } else if (button.classList.contains('delete-product-button')) {
        // ... (existing delete product logic) ...
    }
}


async function handleSavePackConfiguration() {
    if (!appState.activeTCGId || !appState.activeSetId || !appState.activeProductId) {
        uiManager.showStatus("No active pack product selected.", "error");
        return;
    }
    const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
    const product = set?.getProductById(appState.activeProductId);
    if (!product || product.type !== 'pack') {
        uiManager.showStatus("Selected product is not a pack or not found.", "error");
        return;
    }

    const newSlotConfig = [];
    const slotDivs = slotConfigurationContainer.querySelectorAll('.slot-config');
    try {
        slotDivs.forEach((sD, slotIndex) => { // Added slotIndex for better error reporting
            const typeSelect = sD.querySelector('.slot-type-select');
            const countInput = sD.querySelector('.slot-count-input');
            if (!typeSelect || !countInput) throw new Error(`Slot ${slotIndex + 1} is missing type or count input.`);

            const type = typeSelect.value;
            const count = parseInt(countInput.value);
            if (isNaN(count) || count < 1) throw new Error(`Invalid count in Slot ${slotIndex + 1}.`);

            const slotEntry = { type, count };
            if (type === 'fixed') {
                const rarityInput = sD.querySelector('.slot-rarity-input');
                if (!rarityInput || !rarityInput.value) { // Check for empty value
                    throw new Error(`Rarity must be selected for fixed Slot ${slotIndex + 1}.`);
                }
                slotEntry.rarityId = rarityInput.value; // Ensure frontend uses rarityId for payload consistency
            } else if (type === 'pool') {
                slotEntry.pool = [];
                const poolItemDivs = sD.querySelectorAll('.pool-item-config');
                if (poolItemDivs.length === 0) throw new Error(`Pool in Slot ${slotIndex + 1} cannot be empty.`);

                poolItemDivs.forEach((pID, poolItemIndex) => {
    const raritySelect = pID.querySelector('.pool-item-rarity');
    const weightInput = pID.querySelector('.pool-item-weight');
                    if (!raritySelect || !weightInput) throw new Error(`Pool item ${poolItemIndex + 1} in Slot ${slotIndex + 1} is incomplete.`);

                    const rId = raritySelect.value;
                    const w = parseInt(weightInput.value);

                    // ***** THIS IS THE KEY VALIDATION *****
                     if (!rId) { // Checks if rId is an empty string "" (from "--Select--")
        throw new Error(`Rarity must be selected for pool item ${poolItemIndex + 1} in Slot ${slotIndex + 1}.`);
    }
                    // *************************************

                    if (isNaN(w) || w < 1) throw new Error(`Invalid weight for pool item ${poolItemIndex + 1} in Slot ${slotIndex + 1}.`);
    slotEntry.pool.push({ rarity_id: rId, weight: w }); // Backend expects rarity_id
});
            }
            newSlotConfig.push(slotEntry);
        });
    } catch (validationError) {
        uiManager.showStatus(`Validation Error: ${validationError.message}`, "error");
        return; // Stop if validation fails
    }

    // Ensure cardsPerPackInput is valid before proceeding
    const cardsPerPackValue = parseInt(cardsPerPackInput.value);
    if (isNaN(cardsPerPackValue) || cardsPerPackValue < 1) {
        uiManager.showStatus("Valid 'Total Cards Per Pack' is required.", "error");
        return;
    }

    const payload = {
        name: product.name,
        type: product.type,
        cards_per_pack: cardsPerPackValue,
        slotConfiguration: newSlotConfig
        // Include other fields like pack_product_id, packs_per_box, etc., if they are part of the product's editable details here
        // For now, assuming this specific save is focused on pack config structure and cards_per_pack
    };

    uiManager.showStatus(`Saving pack configuration for ${product.name}...`, 'info', 0);
    try {
        const updatedProductData = await apiService.updateProduct(appState.activeProductId, payload);
        const updatedProduct = Product.fromPlainObject(updatedProductData, appState.activeSetId);
        
        const productIndex = set.products.findIndex(p => p.id === appState.activeProductId);
        if (productIndex > -1) {
            set.products[productIndex] = updatedProduct;
            // If this was the product being edited for "main details", update that state too
            if (appState.editingProductDetails && appState.editingProductDetails.productId === appState.activeProductId) {
                appState.editingProductDetails.originalSlotConfiguration = updatedProduct.slotConfiguration ? JSON.parse(JSON.stringify(updatedProduct.slotConfiguration)) : [];
                appState.editingProductDetails.originalBoxGuaranteesJson = updatedProduct.box_guarantees_json || JSON.stringify({rules:[], notes:""});
                appState.editingProductDetails.originalCaseGuaranteesJson = updatedProduct.case_guarantees_json || JSON.stringify({rules:[], notes:""});
            }
        } else {
            set.addProduct(updatedProduct); // Should ideally not happen if editing
        }
        
        const raritiesInSet = set?.rarities || [];
        uiManager.displayPackConfigEditorUI(updatedProduct, raritiesInSet); // Refresh editor UI
        uiManager.renderProductList(set.products); // Refresh product list in case details changed (like cards_per_pack visible in list)
        uiManager.showStatus(`Pack configuration for '${product.name}' saved successfully.`, 'success');
    } catch (error) {
        console.error("Error saving pack configuration:", error);
        uiManager.showStatus(`Failed to save pack configuration: ${error.message}`, 'error');
    }
}

async function handleAddCardFormSubmit(event) {
    event.preventDefault();
    // Ensure a set is active, as cards belong to sets
    if (!appState.activeSetId) {
        uiManager.showStatus("Please select a Set first.", "error");
        return;
    }

    const name = newCardNameInput.value.trim();
    const rarity_id = newCardRarityIdSelect.value;
    const market_price_val = newCardMarketPriceInput.value;
    const image_url = newCardImageUrlInput.value.trim();
    const card_number_val = newCardCardNumberInput.value.trim();


    if (!name || !rarity_id) {
        uiManager.showStatus("Card Name and Rarity are required.", "error");
        return;
    }
    if (market_price_val === '' || isNaN(parseFloat(market_price_val))) {
         uiManager.showStatus("Market Price must be a valid number (e.g., 0.00).", "error");
        return;
    }
    const market_price = parseFloat(market_price_val);


    if (appState.editingCardDetails) { // ----- UPDATE existing Card -----
        const { setId, cardId } = appState.editingCardDetails;
        const currentCardIdInForm = newCardIdInput.value; // Should be read-only and match cardId

        if (currentCardIdInForm !== cardId) {
            uiManager.showStatus("Card ID mismatch during update. Please refresh.", "error");
            return;
        }

        const card_number_from_form = newCardCardNumberInput.value.trim();
        const final_card_number = card_number_from_form || cardId; // Default to existing ID if card_number input is empty

        const cardDataToUpdate = {
            name: newCardNameInput.value.trim(),
            rarity_id: newCardRarityIdSelect.value,
            market_price: parseFloat(newCardMarketPriceInput.value),
            image_url: newCardImageUrlInput.value.trim() || null,
            card_number: final_card_number
        };

        // Add validation for name, rarity_id, market_price here before sending
        if (!cardDataToUpdate.name || !cardDataToUpdate.rarity_id) {
             uiManager.showStatus("Card Name and Rarity are required.", "error"); return;
        }
        if (isNaN(cardDataToUpdate.market_price)) {
             uiManager.showStatus("Market Price must be a valid number.", "error"); return;
        }


        uiManager.showStatus(`Updating Card '${cardDataToUpdate.name}'...`, 'info', 0);
        try {
            const updatedCardDataFromServer = await apiService.updateCard(setId, cardId, cardDataToUpdate);
            const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(setId);
            if (set) {
                const cardIndex = set.cards.findIndex(c => c.id === cardId && c.set_id === setId);
                if (cardIndex !== -1) {
                    set.cards[cardIndex] = Card.fromPlainObject(updatedCardDataFromServer, setId);
                }
                uiManager.renderCardList(set.cards, set.rarities);
            }
            uiManager.resetCardForm();
            appState.editingCardDetails = null; // Exit edit mode
            uiManager.showStatus(`Card '${cardDataToUpdate.name}' updated successfully.`, 'success');
        } catch (error) {
            console.error("Error updating Card:", error);
            uiManager.showStatus(`Failed to update Card: ${error.message}`, 'error');
        }
    } else { // ----- ADD new Card -----
        const id = newCardIdInput.value.trim(); // This is the card's unique ID/number within the set
        if (!id) { uiManager.showStatus("Card ID/Number is required for new card.", "error"); return; }
        if (!/^\S+$/.test(id)) { uiManager.showStatus("Card ID/Number cannot contain spaces.", "error"); return; }

        const card_number = card_number_val || id; // Default collector number to ID if field is empty
        if (card_number_val && !/^\S*$/.test(card_number_val)) { uiManager.showStatus("Collector Number, if provided, cannot contain spaces.", "error"); return; }


        const cardDataToAdd = { id, name, rarity_id, set_id: appState.activeSetId, image_url: image_url || null, market_price, card_number };

        uiManager.showStatus(`Adding card '${name}'...`, 'info', 0);
        try {
            const newCardData = await apiService.addCard(appState.activeSetId, cardDataToAdd);
            const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId); // Re-fetch set in case
            if (set) {
                const newCard = Card.fromPlainObject(newCardData, appState.activeSetId);
                if (set.addCard(newCard)) {
                    uiManager.renderCardList(set.cards, set.rarities);
                    uiManager.resetCardForm();
                    uiManager.showStatus(`Card '${name}' added successfully.`, 'success');
                } else {
                    uiManager.showStatus(`Card '${name}' (ID: ${id}) already exists locally or could not be added.`, 'warning');
                }
            }
        } catch (error) {
            console.error("Error adding card:", error);
            uiManager.showStatus(`Failed to add card: ${error.message}`, 'error');
        }
    }
}

async function handleCardListClick(event) {
    console.log("==> handleCardListClick: Function Entered. Event Type:", event.type); // NEW LOG - VERY FIRST LINE
    console.log("    Event Target:", event.target);
    console.log("    Event CurrentTarget:", event.currentTarget); // Should be cardListContainer

    const button = event.target.closest('button');
    if (!button) {
        console.log("handleCardListClick: Click was not on or inside a button element (event.target.closest('button') returned null).");
        return;
    }
    console.log("handleCardListClick: Button found via closest(). Classes:", button.className);

    if (button.classList.contains('delete-card-button')) {
        console.log("handleCardListClick: 'delete-card-button' identified by classList.contains.");
        const cardId = button.dataset.cardId;

        if (!appState.activeTCGId || !appState.activeSetId || !cardId) {
            uiManager.showStatus("Context missing for card deletion (TCG/Set/Card ID).", "error");
            console.log("handleCardListClick (delete): Context missing", appState.activeTCGId, appState.activeSetId, cardId);
            return;
        }

        console.log(`handleCardListClick (delete): Attempting to delete card: ${cardId} from set: ${appState.activeSetId}`);

        if (confirm(`Are you sure you want to delete card '${cardId}' from set '${appState.activeSetId}'?`)) {
            uiManager.showStatus(`Deleting card '${cardId}'...`, 'info', 0);
            try {
                const deleteResponse = await apiService.deleteCard(appState.activeSetId, cardId);
                console.log("handleCardListClick (delete): API Delete Response:", deleteResponse);

                if (deleteResponse && deleteResponse.message === "success") {
                    const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
                    if (set) {
                        const cardRemovedLocally = set.removeCard(cardId);
                        if (cardRemovedLocally) {
                            console.log(`handleCardListClick (delete): Card ${cardId} removed locally.`);
                            uiManager.renderCardList(set.cards, set.rarities);
                            uiManager.showStatus(`Card '${cardId}' deleted successfully.`, 'success');
                        } else {
                            console.warn(`handleCardListClick (delete): Card ${cardId} deleted from DB, but local removal failed or card not found. Refreshing card list.`);
                            uiManager.showStatus(`Card '${cardId}' deleted. Refreshing list.`, 'warning');
                            const updatedCards = await apiService.fetchCardsForSet(appState.activeSetId);
                            set.cards = updatedCards.map(c => Card.fromPlainObject(c, appState.activeSetId));
                            uiManager.renderCardList(set.cards, set.rarities);
                        }
                    } else {
                        console.error("handleCardListClick (delete): Could not find set locally to remove card from after successful delete.");
                        uiManager.showStatus("Card deleted from server, but local set data error. Please refresh.", "error");
                    }
                } else {
                    console.error("handleCardListClick (delete): Delete API call did not return a success message:", deleteResponse);
                    uiManager.showStatus(`Failed to confirm card '${cardId}' deletion from server. Response: ${deleteResponse ? JSON.stringify(deleteResponse) : 'undefined'}`, 'error');
                }
            } catch (error) {
                console.error("handleCardListClick (delete): Error during card deletion process:", error);
                uiManager.showStatus(`Failed to delete card '${cardId}': ${error.message}`, 'error');
            }
        } else {
            console.log("handleCardListClick (delete): Card deletion cancelled by user.");
        }
    } else if (button.classList.contains('edit-card-button')) {
        console.log("handleCardListClick: 'edit-card-button' identified by classList.contains.");
        // ... your existing edit card logic ...
    } else {
        console.log("handleCardListClick: Button clicked does not have 'delete-card-button' or 'edit-card-button' class. Actual classes:", button.className);
    }
}

async function handleSaveAllGuarantees(scope) { // scope is 'box' or 'case'
    const productToSave = scope === 'box' ? appState.activeProductForBoxGuarantees : appState.activeProductForCaseGuarantees;
    if (!productToSave || !appState.activeTCGId || !appState.activeSetId) {
        uiManager.showStatus("No active product or context to save guarantees.", "error"); return;
    }

    let guaranteeConfigObject;
    let payloadKey;
    let notesInputEl;

    if (scope === 'box') {
        guaranteeConfigObject = productToSave.box_guarantees_config;
        notesInputEl = boxNotesInput;
        payloadKey = 'box_guarantees_json';
    } else { // case
        guaranteeConfigObject = productToSave.case_guarantees_config;
        notesInputEl = caseNotesInput;
        payloadKey = 'case_guarantees_json';
    }

    if (notesInputEl) guaranteeConfigObject.notes = notesInputEl.value.trim();
    const guaranteeJsonString = JSON.stringify(guaranteeConfigObject || { rules: [], notes: "" });

    const productUpdatePayload = {
        name: productToSave.name,
        type: productToSave.type,
        cards_per_pack: productToSave.cards_per_pack,
        slotConfiguration: productToSave.slotConfiguration,
        pack_product_id: productToSave.pack_product_id,
        packs_per_box: productToSave.packs_per_box,
        box_product_id: productToSave.box_product_id,
        boxes_per_case: productToSave.boxes_per_case,
        [payloadKey]: guaranteeJsonString
    };
    Object.keys(productUpdatePayload).forEach(key => productUpdatePayload[key] === undefined && delete productUpdatePayload[key]);


    uiManager.showStatus(`Saving ${scope} guarantees for ${productToSave.name}...`, 'info', 0);
    try {
        const updatedProductData = await apiService.updateProduct(productToSave.id, productUpdatePayload);
        const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        const productIndex = set?.products.findIndex(p => p.id === productToSave.id);

        if (set && productIndex !== -1) {
            set.products[productIndex] = Product.fromPlainObject(updatedProductData, appState.activeSetId);
            // Re-assign active product to the updated one from AppDB
            if (scope === 'box') appState.activeProductForBoxGuarantees = set.products[productIndex];
            else appState.activeProductForCaseGuarantees = set.products[productIndex];
        }
        uiManager.renderProductList(set?.products || []);
        uiManager.showStatus(`${scope} guarantees for '${productToSave.name}' saved successfully.`, 'success');

        // Refresh the editor view
        const raritiesInSet = set?.rarities || [];
        if (scope === 'box') uiManager.openBoxGuaranteeEditor(appState.activeProductForBoxGuarantees, raritiesInSet);
        else uiManager.openCaseGuaranteeEditor(appState.activeProductForCaseGuarantees, raritiesInSet);

    } catch (error) {
        console.error(`Error saving ${scope} guarantees:`, error);
        uiManager.showStatus(`Failed to save ${scope} guarantees: ${error.message}`, 'error');
    }
}

// Helper to fetch a full template with rules, used by POST and PUT
function fetchFullTemplate(templateId, res, successStatusCode = 200) {
    let templateData = {};
    db.get("SELECT id, name, description, scope FROM guarantee_templates WHERE id = ?", [templateId], (err, templateRow) => {
        if (err || !templateRow) {
            console.error("fetchFullTemplate: Error fetching template row or template not found. ID:", templateId, err);
            // If the operation was a create (201), it's problematic if we can't fetch it back.
            // If it was an update (200), it's also an issue.
            return res.status(successStatusCode === 201 ? 500 : 404).json({ message: successStatusCode === 201 ? "Template created, but error fetching complete data." : "Template updated, but error fetching complete data or template not found."});
        }
        templateData = templateRow;
        templateData.rules = [];
        const rulesSql = "SELECT rule_json, sort_order FROM guarantee_template_rules WHERE template_id = ? ORDER BY sort_order, id";
        db.all(rulesSql, [templateId], (rulesErr, ruleRows) => {
            if (rulesErr) {
                templateData.rules_error = "Could not retrieve rules.";
            } else {
                try { templateData.rules = ruleRows.map(r => JSON.parse(r.rule_json)); }
                catch (parseError) { templateData.rules_error = "Error parsing stored rules."; }
            }
            res.status(successStatusCode).json({ "message": "success", "data": templateData });
        });
    });
}

// --- DOMContentLoaded: Assign elements and attach listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Assign all DOM element variables
    loadDataButton = document.getElementById('loadDataButton');
    exportDataButton = document.getElementById('exportDataButton');
    importDataInput = document.getElementById('importDataInput');
    statusMessageEl = document.getElementById('statusMessage');
    tcgListContainer = document.getElementById('tcgListContainer');
    addTcgForm = document.getElementById('addTcgForm');
    newTcgIdInput = document.getElementById('newTcgId');
    newTcgNameInput = document.getElementById('newTcgName');
    setManagementSection = document.getElementById('setManagementSection');
    selectedTcgNameEl = document.getElementById('selectedTcgName');
    setListContainer = document.getElementById('setListContainer');
    addSetForm = document.getElementById('addSetForm');
    newSetIdInput = document.getElementById('newSetId');
    newSetNameInput = document.getElementById('newSetName');
    rarityManagementSection = document.getElementById('rarityManagementSection');
    selectedSetNameForRarityEl = document.getElementById('selectedSetNameForRarity');
    rarityListContainer = document.getElementById('rarityListContainer');
    addRarityForm = document.getElementById('addRarityForm');
    newRarityIdInput = document.getElementById('newRarityId');
    newRarityNameInput = document.getElementById('newRarityName');
    newRarityColorClassInput = document.getElementById('newRarityColorClass');
    copyRaritiesSection = document.getElementById('copyRaritiesSection');
    copySourceTcgSelect = document.getElementById('copySourceTcgSelect');
    copySourceSetSelect = document.getElementById('copySourceSetSelect');
    copyRaritiesButton = document.getElementById('copyRaritiesButton');
    productManagementSection = document.getElementById('productManagementSection');
    selectedSetNameForProductManagementEl = document.getElementById('selectedSetNameForProductManagement');
    productListContainer = document.getElementById('productListContainer');
    addProductForm = document.getElementById('addProductForm');
    newProductIdInput = document.getElementById('newProductId');
    newProductNameInput = document.getElementById('newProductName');
    newProductTypeSelect = document.getElementById('newProductType');
    packSpecificFieldsDiv = document.getElementById('packSpecificFields');
    newProductCardsPerPackInput = document.getElementById('newProductCardsPerPack');
    boxSpecificFieldsDiv = document.getElementById('boxSpecificFields');
    newProductPacksPerBoxInput = document.getElementById('newProductPacksPerBox');
    newProductPackProductIdInput = document.getElementById('newProductPackProductId');
    // newProductBoxGuaranteesInput = document.getElementById('newProductBoxGuarantees');
    caseSpecificFieldsDiv = document.getElementById('caseSpecificFields');
    newProductBoxesPerCaseInput = document.getElementById('newProductBoxesPerCase');
    newProductBoxProductIdInput = document.getElementById('newProductBoxProductId');
    // newProductCaseGuaranteesInput = document.getElementById('newProductCaseGuarantees');
    cardManagementSection = document.getElementById('cardManagementSection');
    selectedSetNameForCardManagementEl = document.getElementById('selectedSetNameForCardManagement');
    cardListContainer = document.getElementById('cardListContainer');
    addCardForm = document.getElementById('addCardForm');
    newCardIdInput = document.getElementById('newCardId');
    newCardNameInput = document.getElementById('newCardName');
    newCardRarityIdSelect = document.getElementById('newCardRarityId');
    newCardMarketPriceInput = document.getElementById('newCardMarketPrice');
    newCardImageUrlInput = document.getElementById('newCardImageUrl');
    newCardCardNumberInput = document.getElementById('newCardCardNumber');
    packConfigEditorEl = document.getElementById('packConfigEditor');
    editingProductNameEl = document.getElementById('editingProductName');
    cardsPerPackInput = document.getElementById('cardsPerPackInput');
    slotConfigurationContainer = document.getElementById('slotConfigurationContainer');
    addSlotButton = document.getElementById('addSlotButton');
    savePackConfigurationButton = document.getElementById('savePackConfigurationButton');
    boxGuaranteeEditorSection = document.getElementById('boxGuaranteeEditorSection');
    editingBoxProductNameEl = document.getElementById('editingBoxProductName');
    boxNotesInput = document.getElementById('boxNotesInput');
    boxGuaranteeRulesContainer = document.getElementById('boxGuaranteeRulesContainer');
    addNewBoxGuaranteeRuleButton = document.getElementById('addNewBoxGuaranteeRuleButton');
    saveBoxGuaranteesButton = document.getElementById('saveBoxGuaranteesButton');
    closeBoxGuaranteeEditorButton = document.getElementById('closeBoxGuaranteeEditorButton');
    caseGuaranteeEditorSection = document.getElementById('caseGuaranteeEditorSection');
    editingCaseProductNameEl = document.getElementById('editingCaseProductName');
    caseNotesInput = document.getElementById('caseNotesInput');
    caseGuaranteeRulesContainer = document.getElementById('caseGuaranteeRulesContainer');
    addNewCaseGuaranteeRuleButton = document.getElementById('addNewCaseGuaranteeRuleButton');
    saveCaseGuaranteesButton = document.getElementById('saveCaseGuaranteesButton');
    closeCaseGuaranteeEditorButton = document.getElementById('closeCaseGuaranteeEditorButton');
    guaranteeRuleFormModal = document.getElementById('guaranteeRuleFormModal');
    ruleFormTitle = document.getElementById('ruleFormTitle');
    editingRuleIndexInput = document.getElementById('editingRuleIndex');
    editingRuleScopeInput = document.getElementById('editingRuleScopeType'); // Matches your HTML id
    ruleIdInput = document.getElementById('ruleIdInput');
    ruleDescriptionInput = document.getElementById('ruleDescriptionInput');
    ruleTypeSelect = document.getElementById('ruleTypeSelect');
    ruleCountFieldsContainer = document.getElementById('ruleCountFieldsContainer');
    ruleCountMinInput = ruleCountFieldsContainer?.querySelector('#ruleCountMinInput');
    ruleCountMaxInput = ruleCountFieldsContainer?.querySelector('#ruleCountMaxInput');
    ruleCountExactInput = ruleCountFieldsContainer?.querySelector('#ruleCountExactInput');
    ruleCountTargetAverageInput = ruleCountFieldsContainer?.querySelector('#ruleCountTargetAverageInput');
    ruleTargetRarityIdsSelect = document.getElementById('ruleTargetRarityIdsSelect');
	ruleTargetRarityTextContainer = document.getElementById('ruleTargetRarityTextContainer'); // NEW
    ruleTargetRarityIdsTextarea = document.getElementById('ruleTargetRarityIdsTextarea');   // NEW
    ruleTargetCardIdsInput = document.getElementById('ruleTargetCardIdsInput');
    chaseRuleFieldsContainer = document.getElementById('chaseRuleFieldsContainer');
    ruleChaseChanceInput = document.getElementById('ruleChaseChanceInput');
    ruleChaseGuaranteedIfHitInput = document.getElementById('ruleChaseGuaranteedIfHitInput');
    ruleChaseAddsToTotalInput = document.getElementById('ruleChaseAddsToTotalInput');
    boxTopperRuleFieldsContainer = document.getElementById('boxTopperRuleFieldsContainer');
    ruleBTQuantityInput = document.getElementById('ruleBTQuantityInput');
    ruleBTSourcePackProductIdInput = document.getElementById('ruleBTSourcePackProductIdInput');
    cancelRuleFormButton = document.getElementById('cancelRuleFormButton');
    saveRuleFormButton = document.getElementById('saveRuleFormButton');
    closeRuleFormButton = document.getElementById('closeRuleFormButton');
	boxGuaranteeTemplateSelect = document.getElementById('boxGuaranteeTemplateSelect');
    applyBoxGuaranteeTemplateButton = document.getElementById('applyBoxGuaranteeTemplateButton');
    caseGuaranteeTemplateSelect = document.getElementById('caseGuaranteeTemplateSelect');
    applyCaseGuaranteeTemplateButton = document.getElementById('applyCaseGuaranteeTemplateButton');
	// Assignments for Template Management Section
    templateManagementSection = document.getElementById('templateManagementSection');
    addEditTemplateFormContainer = document.getElementById('addEditTemplateFormContainer');
    templateFormTitle = document.getElementById('templateFormTitle');
    addEditTemplateForm = document.getElementById('addEditTemplateForm');
    templateIdInput = document.getElementById('templateIdInput');
    templateNameInput = document.getElementById('templateNameInput');
    templateDescriptionInput = document.getElementById('templateDescriptionInput');
    templateScopeSelect = document.getElementById('templateScopeSelect');
    saveTemplateButton = document.getElementById('saveTemplateButton');
    cancelEditTemplateButton = document.getElementById('cancelEditTemplateButton');
    showAddTemplateFormButton = document.getElementById('showAddTemplateFormButton');
    filterTemplateScopeSelect = document.getElementById('filterTemplateScopeSelect');
    templateListContainer = document.getElementById('templateListContainer');
    templateRulesManagementSection = document.getElementById('templateRulesManagementSection');
    editingTemplateNameDisplay = document.getElementById('editingTemplateNameDisplay');
    templateRulesContainer = document.getElementById('templateRulesContainer');
    addNewRuleToTemplateButton = document.getElementById('addNewRuleToTemplateButton');
    saveAllRulesToTemplateButton = document.getElementById('saveAllRulesToTemplateButton');
    closeTemplateRulesEditorButton = document.getElementById('closeTemplateRulesEditorButton');
	// Assignments for Card CSV Import UI (inside cardManagementSection)
    cardCsvImportInput = document.getElementById('cardCsvImportInput');
    importCardsCsvButton = document.getElementById('importCardsCsvButton');
    cardImportStatus = document.getElementById('cardImportStatus');
	
	// Example: Button to show the template management section
    // manageTemplatesButton = document.getElementById('manageTemplatesButton'); // Assuming you added this button to index.html
    // manageTemplatesButton?.addEventListener('click', () => {
    //     if(templateManagementSection) templateManagementSection.classList.toggle('hidden');
    //     if(!templateManagementSection.classList.contains('hidden')) {
    //         templateManager.loadAndDisplayTemplates(); // Load templates when section is shown
    //     }
    // });
	
	// Initialize Card Importer
    if (typeof cardImporter !== 'undefined' && cardImporter.initCardImporter) {
        try {
            cardImporter.initCardImporter();
        } catch (e) {
            console.error("Error during cardImporter.initCardImporter():", e);
        }
    } else {
        console.error("cardImporter object or its init function is missing. Ensure cardImporter.js is loaded before app.js.");
    }

    // Initialize Template Manager
    if (typeof templateManager !== 'undefined' && templateManager.init) {
        templateManager.init();
    } else {
        console.error("templateManager is not defined or init function is missing.");
    }

    // Modify the global saveRuleFormButton listener (if it directly calls uiManager.saveRuleFromFormToList)
    // OR better, modify uiManager.saveRuleFromFormToList to be aware of context
    // For simplicity, if saveRuleFormButton is global in your modal:
    const originalSaveRuleFormButton = document.getElementById('saveRuleFormButton');
    originalSaveRuleFormButton?.addEventListener('click', () => {
        if (appState.activeRuleBeingEditedFor === 'template') {
            // This is a simplified way to call. Ideally, uiManager.saveRuleFromFormToList
            // itself would be more generic or templateManager.js would have its own handler for the modal.
            // For now, let's assume templateManager.saveRuleToCurrentTemplateList is a new function
            // that uiManager.saveRuleFromFormToList can call if appState.activeRuleBeingEditedFor === 'template'

            // The more direct way is that saveRuleFromFormToList in uiManager.js would be modified
            // to check appState.activeRuleBeingEditedFor.
            // Let's assume uiManager.saveRuleFromFormToList is already modified like that.
            uiManager.saveRuleFromFormToList(); // This function will now need to check appState.activeRuleBeingEditedFor
        } else { // Default to product guarantees
            uiManager.saveRuleFromFormToList();
        }
    });

    // Attach Event Listeners
    loadDataButton?.addEventListener('click', handleLoadTCGs);
    exportDataButton?.addEventListener('click', handleExportData);
    importDataInput?.addEventListener('change', handleImportData);
	applyBoxGuaranteeTemplateButton?.addEventListener('click', () => appActions.handleApplyGuaranteeTemplate('box'));
    applyCaseGuaranteeTemplateButton?.addEventListener('click', () => appActions.handleApplyGuaranteeTemplate('case'));

    addTcgForm?.addEventListener('submit', handleAddTcgFormSubmit);
    tcgListContainer?.addEventListener('click', handleTcgListClick);

    addSetForm?.addEventListener('submit', handleAddSetFormSubmit);
    setListContainer?.addEventListener('click', handleSetListClick);

    addRarityForm?.addEventListener('submit', handleAddRarityFormSubmit);
    // VVVVVV THIS LINE IS CRUCIAL VVVVVV
    rarityListContainer?.addEventListener('click', handleRarityListClick); // Make sure this line is present and correct

    copySourceTcgSelect?.addEventListener('change', (e) => {
        const sourceTcg = AppDB.getTCGById(e.target.value);
        uiManager.populateCopySourceSetSelect(sourceTcg?.sets || [], appState.activeSetId, appState.activeTCGId);
    });
    copyRaritiesButton?.addEventListener('click', handleCopyRarities);

    newProductTypeSelect?.addEventListener('change', uiManager.toggleProductTypeFields);
    addProductForm?.addEventListener('submit', handleAddProductFormSubmit);
    productListContainer?.addEventListener('click', handleProductListClick);

    addSlotButton?.addEventListener('click', () => {
        if (!appState.activeProductId) { uiManager.showStatus("Select a Pack Product first to add slots.", "error"); return; }
        const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        uiManager.addSlotToForm(undefined, slotConfigurationContainer.children.length, set?.rarities || []);
    });
    savePackConfigurationButton?.addEventListener('click', handleSavePackConfiguration);

    addCardForm?.addEventListener('submit', handleAddCardFormSubmit);
    cardListContainer?.addEventListener('click', handleCardListClick);

    // Guarantee Editor Listeners
    closeBoxGuaranteeEditorButton?.addEventListener('click', () => {
        if (boxGuaranteeEditorSection) boxGuaranteeEditorSection.classList.add('hidden');
        appState.activeProductForBoxGuarantees = null;
    });
    closeCaseGuaranteeEditorButton?.addEventListener('click', () => {
        if (caseGuaranteeEditorSection) caseGuaranteeEditorSection.classList.add('hidden');
        appState.activeProductForCaseGuarantees = null;
    });
    closeRuleFormButton?.addEventListener('click', () => {
        if (guaranteeRuleFormModal) guaranteeRuleFormModal.classList.add('hidden');
    });
    cancelRuleFormButton?.addEventListener('click', () => {
        if (guaranteeRuleFormModal) guaranteeRuleFormModal.classList.add('hidden');
    });
    addNewBoxGuaranteeRuleButton?.addEventListener('click', () => {
        const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        uiManager.openRuleForm(null, -1, 'box', set?.rarities || []);
    });
    addNewCaseGuaranteeRuleButton?.addEventListener('click', () => {
        const set = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        uiManager.openRuleForm(null, -1, 'case', set?.rarities || []);
    });
	if (cardListContainer) {
        console.log("app.js: cardListContainer found, attaching click listener for handleCardListClick.");
        cardListContainer.addEventListener('click', handleCardListClick);
    } else {
        console.error("app.js: CRITICAL - cardListContainer element NOT FOUND in DOM! Card clicks won't work.");
    }

    if (addCardForm) {
        addCardForm.addEventListener('submit', handleAddCardFormSubmit);
    } else {
        console.error("app.js: CRITICAL - addCardForm element NOT FOUND in DOM! Adding/Editing cards won't work.");
    }
	
    saveRuleFormButton?.addEventListener('click', () => uiManager.saveRuleFromFormToList()); // Ensure this is correct
    ruleTypeSelect?.addEventListener('change', uiManager.updateRuleFormFieldVisibility);
    //if(ruleBTIsSealedPackInput) ruleBTIsSealedPackInput.addEventListener('change', uiManager.updateRuleFormFieldVisibility);


    saveBoxGuaranteesButton?.addEventListener('click', () => handleSaveAllGuarantees('box'));
    saveCaseGuaranteesButton?.addEventListener('click', () => handleSaveAllGuarantees('case'));


    // Initial UI setup
    if (statusMessageEl) uiManager.showStatus('Editor ready. Load TCGs or import data.', 'info');
    else console.error("statusMessageEl is not defined at initial showStatus call.");

    uiManager.populateCopySourceTCGSelect(AppDB.tcgs);
    uiManager.toggleProductTypeFields();
});