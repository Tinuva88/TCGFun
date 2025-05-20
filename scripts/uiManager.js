// scripts/uiManager.js

// DOM Element variables are expected to be assigned globally in app.js after DOMContentLoaded.
// For larger projects, consider passing elements to an init function or to individual methods.

const uiManager = {
    showStatus: function(message, type = 'info', duration = 4000) {
        if (!statusMessageEl) { console.warn("statusMessageEl not assigned yet for:", message); return; }
        statusMessageEl.textContent = message;
        statusMessageEl.className = 'text-sm mt-2 h-5'; // Reset classes
        if (type === 'success') statusMessageEl.classList.add('text-green-400');
        else if (type === 'error') statusMessageEl.classList.add('text-red-400');
        else statusMessageEl.classList.add('text-yellow-400'); // Default to info/warning
        if (duration > 0) { setTimeout(() => { if (statusMessageEl && statusMessageEl.textContent === message) statusMessageEl.textContent = ''; }, duration); }
    },
	
	// In scripts/uiManager.js
// This function MUST be a method inside the 'const uiManager = { ... };' object

    updateRuleFormFieldVisibility: function() {
        // Ensure all DOM element variables used here are accessible (e.g., defined globally in app.js or passed)
        if (!ruleTypeSelect || !ruleCountFieldsContainer || !chaseRuleFieldsContainer || !boxTopperRuleFieldsContainer ||
            !ruleCountMinInput || !ruleCountMaxInput || !ruleCountExactInput || !ruleCountTargetAverageInput ||
            !ruleChaseChanceInput || !ruleChaseGuaranteedIfHitInput || !ruleChaseAddsToTotalInput ||
            !ruleBTQuantityInput || !ruleBTSourcePackProductIdInput ) { // Updated for new BoxTopper field
            console.error("updateRuleFormFieldVisibility: One or more critical rule form dynamic field elements are missing from global scope! Check DOM element assignments in app.js and IDs in index.html.");
            this.showStatus("Error: Rule form UI elements missing.", "error");
            return;
        }

        const type = ruleTypeSelect.value;
        const ruleData = appState.activeRuleBeingEdited.data || {}; // From app.js appState
        const countData = ruleData.count || {};
        const detailsData = ruleData.details || {}; // Use existing details or empty object

        // Hide all dynamically shown sections by default
        ruleCountFieldsContainer.querySelectorAll('div').forEach(div => div.style.display = 'none');
        chaseRuleFieldsContainer.classList.add('hidden');
        boxTopperRuleFieldsContainer.classList.add('hidden'); // Hide by default

        // This scope is crucial for determining if 'BoxTopper' is applicable
        const targetScopeForRule = appState.activeRuleBeingEdited.scope;

        if (type === "atLeast") {
            ruleCountMinInput.parentElement.style.display = 'block';
            ruleCountMinInput.value = countData.min ?? 1;
        } else if (type === "atMost") {
            ruleCountMaxInput.parentElement.style.display = 'block';
            ruleCountMaxInput.value = countData.max ?? 1;
        } else if (type === "exact") {
            ruleCountExactInput.parentElement.style.display = 'block';
            ruleCountExactInput.value = countData.exact ?? 1;
        } else if (type === "range") {
            ruleCountMinInput.parentElement.style.display = 'block';
            ruleCountMaxInput.parentElement.style.display = 'block';
            ruleCountMinInput.value = countData.min ?? 1;
            ruleCountMaxInput.value = countData.max ?? 1;
        } else if (type === "average") {
            ruleCountTargetAverageInput.parentElement.style.display = 'block';
            ruleCountTargetAverageInput.value = countData.targetAverage ?? 1;
        } else if (type === "chase") {
            chaseRuleFieldsContainer.classList.remove('hidden');
            ruleChaseChanceInput.value = ruleData.chance ?? 0.1;
            ruleChaseGuaranteedIfHitInput.value = ruleData.guaranteedIfHit ?? 1;
            ruleChaseAddsToTotalInput.checked = ruleData.addsToTotal || false;
        } else if (type === "boxTopper" && targetScopeForRule === 'box') {
            boxTopperRuleFieldsContainer.classList.remove('hidden'); // Show the container
            ruleBTQuantityInput.value = detailsData.quantity ?? 1;
            ruleBTSourcePackProductIdInput.value = detailsData.sourcePackProductId || '';
            // The old checkbox and its dependent fields (ruleBTSealedPackFields, ruleBTCardPoolFields) were removed
            // No onchange handler needed for the old checkbox here.
        } else if (type === "boxTopper" && targetScopeForRule !== 'box') {
            // If BoxTopper is somehow selected for a non-box scope (e.g. case), hide it and reset type
            boxTopperRuleFieldsContainer.classList.add('hidden');
            if (ruleTypeSelect.value === 'boxTopper') { // Check if it's currently selected
                this.showStatus("BoxTopper rule type is only for 'box' scope. Resetting type.", "warning", 4000);
                ruleTypeSelect.value = 'atLeast'; // Default to something else
                // Recursive call to update based on the new type.
                // Be careful with recursion; ensure there's a base case or state change that prevents infinite loops.
                // Here, changing the type and then calling again is usually safe if all types are handled.
                this.updateRuleFormFieldVisibility();
                return; // Exit to avoid further processing with incorrect type for this call
            }
        }

        // Handle disabling "BoxTopper" option in the dropdown if the rule's scope is not 'box'
        const boxTopperOption = ruleTypeSelect.querySelector('option[value="boxTopper"]');
        if (boxTopperOption) {
            boxTopperOption.disabled = (targetScopeForRule !== 'box');
        }
    }, // <-- Make sure there's a comma here if other methods follow it in the uiManager object
	
	createNewRuleTemplate: function(scopeType) { // scopeType will be 'box' or 'case' from the modal context
        return {
            id: `rule_${Date.now()}`, // Generate a basic unique ID
            description: "",
            type: "atLeast", // Sensible default type
            targetRarityIds: [],
            targetCardIds: [],
            count: { min: 1 }, // Default count for "atLeast"
            scope: scopeType === 'box' ? 'perBox' : 'perCase', // Set scope based on modal context
            // Chase specific defaults (will only be used if type becomes 'chase')
            chance: 0.1,
            guaranteedIfHit: 1,
            addsToTotal: false,
            // BoxTopper specific defaults (will only be used if type becomes 'boxTopper')
            details: {
                quantity: 1, // For BoxTopper: quantity of cards drawn
                sourcePackProductId: "" // For the new BoxTopper
            }
        };
    },

    // --- Section Visibility ---
    hideSetAndSubsequentSections: function() {
        if (setManagementSection) setManagementSection.classList.add('hidden');
        this.hideRarityAndSubsequentSections();
    },

    hideRarityAndSubsequentSections: function() {
        if (rarityManagementSection) rarityManagementSection.classList.add('hidden');
        this.hideProductAndSubsequentSections();
    },

    hideProductAndSubsequentSections: function() {
        // This hides sections below product management when a new set is selected.
        // ProductManagementSection itself is controlled in app.js's handleSetListClick
        if (cardManagementSection) cardManagementSection.classList.add('hidden');
        if (packConfigEditorEl) packConfigEditorEl.classList.add('hidden');
        if (boxGuaranteeEditorSection) boxGuaranteeEditorSection.classList.add('hidden');
        if (caseGuaranteeEditorSection) caseGuaranteeEditorSection.classList.add('hidden');
        if (guaranteeRuleFormModal) guaranteeRuleFormModal.classList.add('hidden');
    },

    // --- TCG UI ---
    renderTCGList: function(tcgs) {
        if (!tcgListContainer) return;
        tcgListContainer.innerHTML = '';
        if (!tcgs || tcgs.length === 0) {
            tcgListContainer.innerHTML = '<p class="text-slate-400">No TCGs. Load or add one.</p>';
            return;
        }
        tcgs.forEach(tcg => {
            if (!tcg || !tcg.id || !tcg.name) { console.warn("Skipping invalid TCG object in renderTCGList:", tcg); return; }
            const div = document.createElement('div');
            div.className = 'list-item';
            div.innerHTML = `
                <span class="flex-grow">${tcg.name} (ID: ${tcg.id})</span>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-secondary select-tcg-button" data-tcg-id="${tcg.id}" data-tcg-name="${encodeURIComponent(tcg.name)}">Manage Sets</button>
                    <button class="btn btn-sm btn-primary edit-tcg-button" data-tcg-id="${tcg.id}" data-tcg-name="${encodeURIComponent(tcg.name)}">Edit</button>
                </div>`;
            tcgListContainer.appendChild(div);
        });
    },

    prepareTcgFormForEdit: function(tcgId, tcgName) {
        if (!addTcgForm || !newTcgIdInput || !newTcgNameInput) return;
        newTcgIdInput.value = tcgId;
        newTcgIdInput.readOnly = true;
        newTcgIdInput.classList.add('bg-gray-600', 'cursor-not-allowed');
        newTcgNameInput.value = decodeURIComponent(tcgName);
        newTcgNameInput.focus();
        const submitButton = addTcgForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update TCG';
            submitButton.classList.remove('btn-primary');
            submitButton.classList.add('btn-success');
        }
    },

    resetTcgForm: function() {
        if (!addTcgForm || !newTcgIdInput || !newTcgNameInput) return;
        addTcgForm.reset();
        newTcgIdInput.readOnly = false;
        newTcgIdInput.classList.remove('bg-gray-600', 'cursor-not-allowed');
        const submitButton = addTcgForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add TCG';
            submitButton.classList.remove('btn-success');
            submitButton.classList.add('btn-primary');
        }
    },

    // --- Set UI ---
    renderSetList: function(sets) {
        if (!setListContainer) return; setListContainer.innerHTML = '';
        if (!sets || sets.length === 0) {
            setListContainer.innerHTML = '<p class="text-slate-400">No Sets. Add one.</p>'; return;
        }
        sets.forEach(set => {
            const div = document.createElement('div'); div.className = 'list-item';
            div.innerHTML = `
                <span class="flex-grow">${set.name} (ID: ${set.id})</span>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-secondary select-set-button" data-set-id="${set.id}" data-set-name="${encodeURIComponent(set.name)}">Manage Details</button>
                    <button class="btn btn-sm btn-primary edit-set-button" data-set-id="${set.id}" data-set-name="${encodeURIComponent(set.name)}" data-tcg-id="${set.tcg_id}">Edit</button>
                </div>`;
            setListContainer.appendChild(div);
        });
    },

    prepareSetFormForEdit: function(setId, setName) {
        if (!addSetForm || !newSetIdInput || !newSetNameInput) return;
        newSetIdInput.value = setId;
        newSetIdInput.readOnly = true;
        newSetIdInput.classList.add('bg-gray-600', 'cursor-not-allowed');
        newSetNameInput.value = decodeURIComponent(setName);
        newSetNameInput.focus();
        const submitButton = addSetForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Set';
            submitButton.classList.remove('btn-primary');
            submitButton.classList.add('btn-success');
        }
    },

    resetSetForm: function() {
        if (!addSetForm || !newSetIdInput || !newSetNameInput) return;
        addSetForm.reset();
        newSetIdInput.readOnly = false;
        newSetIdInput.classList.remove('bg-gray-600', 'cursor-not-allowed');
        const submitButton = addSetForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add Set';
            submitButton.classList.remove('btn-success');
            submitButton.classList.add('btn-primary');
        }
    },

    // --- Rarity UI ---
    renderRarityList: function(rarities) {
        if (!rarityListContainer) return; rarityListContainer.innerHTML = '';
        if (!rarities || rarities.length === 0) {
            rarityListContainer.innerHTML = '<p class="text-slate-400">No Rarities. Add or copy.</p>'; return;
        }
        rarities.forEach(rarity => {
            const div = document.createElement('div'); div.className = 'list-item';
            div.innerHTML = `
                <span class="flex items-center flex-grow">
                    <span class="inline-block w-4 h-4 mr-2 rounded-sm ${rarity.color_class || 'bg-gray-500'}" title="${rarity.color_class}"></span>
                    ${rarity.name} (ID: ${rarity.id})
                </span>
                <div class="flex gap-2">
                    <button class="btn btn-sm btn-primary edit-rarity-button"
                            data-rarity-id="${rarity.id}"
                            data-rarity-name="${encodeURIComponent(rarity.name || '')}"
                            data-rarity-color-class="${encodeURIComponent(rarity.color_class || '')}"
                            data-set-id="${rarity.set_id}">Edit</button>
                    <button class="btn btn-danger btn-sm delete-rarity-button" data-rarity-id="${rarity.id}" data-set-id="${rarity.set_id}">Delete</button>
                </div>`;
            rarityListContainer.appendChild(div);
        });
    },

    prepareRarityFormForEdit: function(rarityId, rarityName, rarityColorClass) {
        if (!addRarityForm || !newRarityIdInput || !newRarityNameInput || !newRarityColorClassInput) return;
        newRarityIdInput.value = rarityId;
        newRarityIdInput.readOnly = true;
        newRarityIdInput.classList.add('bg-gray-600', 'cursor-not-allowed');
        newRarityNameInput.value = decodeURIComponent(rarityName);
        newRarityColorClassInput.value = decodeURIComponent(rarityColorClass);
        newRarityNameInput.focus();
        const submitButton = addRarityForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Rarity';
            submitButton.classList.remove('btn-primary');
            submitButton.classList.add('btn-success');
        }
    },

    resetRarityForm: function() {
        if (!addRarityForm || !newRarityIdInput || !newRarityNameInput || !newRarityColorClassInput) return;
        addRarityForm.reset();
        newRarityIdInput.readOnly = false;
        newRarityIdInput.classList.remove('bg-gray-600', 'cursor-not-allowed');
        const submitButton = addRarityForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add Rarity';
            submitButton.classList.remove('btn-success');
            submitButton.classList.add('btn-primary');
        }
    },

    // --- Copy Rarities UI ---
    populateCopySourceTCGSelect: function(tcgs) {
        if (!copySourceTcgSelect) return;
        copySourceTcgSelect.innerHTML = '<option value="">-- Source TCG --</option>';
        if (tcgs) {
            tcgs.forEach(tcg => { const o = document.createElement('option'); o.value = tcg.id; o.textContent = tcg.name; copySourceTcgSelect.appendChild(o); });
        }
        if (copySourceSetSelect) copySourceSetSelect.innerHTML = '<option value="">-- Source Set --</option>';
    },

    populateCopySourceSetSelect: function(sets, currentActiveSetId, currentActiveTcgId) {
        if (!copySourceSetSelect) return;
        copySourceSetSelect.innerHTML = '<option value="">-- Source Set --</option>';
        if (!sets) return;
        sets.forEach(set => {
            if (set.tcg_id !== currentActiveTcgId || set.id !== currentActiveSetId) {
                 const o = document.createElement('option'); o.value = set.id; o.textContent = set.name; copySourceSetSelect.appendChild(o);
            }
        });
    },

    // --- Product UI ---
    toggleProductTypeFields: function() {
        if (!newProductTypeSelect || !packSpecificFieldsDiv || !boxSpecificFieldsDiv || !caseSpecificFieldsDiv) return;
        const type = newProductTypeSelect.value;
        packSpecificFieldsDiv.classList.toggle('active', type === 'pack');
        boxSpecificFieldsDiv.classList.toggle('active', type === 'box');
        caseSpecificFieldsDiv.classList.toggle('active', type === 'case');

        if (newProductCardsPerPackInput) newProductCardsPerPackInput.required = (type === 'pack');
        if (newProductPacksPerBoxInput) newProductPacksPerBoxInput.required = (type === 'box');
        if (newProductPackProductIdInput) newProductPackProductIdInput.required = (type === 'box');
        if (newProductBoxesPerCaseInput) newProductBoxesPerCaseInput.required = (type === 'case');
        if (newProductBoxProductIdInput) newProductBoxProductIdInput.required = (type === 'case');
    },

    renderProductList: function(products) {
        if (!productListContainer) {
            console.error("productListContainer not found in uiManager.renderProductList");
            return;
        }
        productListContainer.innerHTML = '';

        if (!products || products.length === 0) {
            productListContainer.innerHTML = '<p class="text-slate-400">No Products. Add one.</p>';
            return;
        }

        products.forEach(product => {
            if (!product || !product.id || !product.name || !product.type) {
                console.warn("renderProductList - Skipping invalid product data:", product);
                return;
            }

            const div = document.createElement('div');
            div.className = 'list-item text-sm';

            let details = `Type: <span class="font-medium">${product.type}</span>`;
            if (product.type === 'pack') {
                details += `, Cards/Pack: ${product.cards_per_pack || 'N/A'}`;
            } else if (product.type === 'box') {
                details += `, Packs/Box: ${product.packs_per_box || 'N/A'}`;
                if (product.pack_product_id) details += `, Pack ID: ${product.pack_product_id}`;
                if (product.box_guarantees_config && product.box_guarantees_config.rules && product.box_guarantees_config.rules.length > 0) {
                    details += `, Guarantees: Yes`;
                } else if (product.box_guarantees_config && product.box_guarantees_config.notes) {
                    details += `, Guarantees: Notes Only`;
                }
            } else if (product.type === 'case') {
                details += `, Boxes/Case: ${product.boxes_per_case || 'N/A'}`;
                if (product.box_product_id) details += `, Box ID: ${product.box_product_id}`;
                if (product.case_guarantees_config && product.case_guarantees_config.rules && product.case_guarantees_config.rules.length > 0) {
                    details += `, Guarantees: Yes`;
                } else if (product.case_guarantees_config && product.case_guarantees_config.notes) {
                    details += `, Guarantees: Notes Only`;
                }
            }

            let productDataAttrs = '';
            for (const key in product) {
                if (Object.hasOwnProperty.call(product, key)) {
                    const value = product[key];
                    if (typeof value !== 'object' && value !== null && value !== undefined &&
                        key !== 'slotConfiguration' && key !== 'box_guarantees_config' && key !== 'case_guarantees_config' &&
                        !key.endsWith('_json')) {
                        productDataAttrs += ` data-${key.replace(/_/g, '-')}="${encodeURIComponent(value)}"`;
                    }
                }
            }
            productDataAttrs = productDataAttrs.trim();

            let actionButtonsHtml = '';
            actionButtonsHtml += `<button class="btn btn-sm btn-primary edit-product-details-button" data-product-id="${product.id}" ${productDataAttrs}>Edit Details</button>`;
            if (product.type === 'pack') {
                actionButtonsHtml += `<button class="btn btn-sm btn-secondary edit-pack-config-button" data-product-id="${product.id}">Edit Pack Config</button>`;
            }
            if (product.type === 'box') {
                actionButtonsHtml += `<button class="btn btn-sm btn-secondary edit-box-guarantees-button" data-product-id="${product.id}">Edit Box Guarantees</button>`;
            }
            if (product.type === 'case') {
                actionButtonsHtml += `<button class="btn btn-sm btn-secondary edit-case-guarantees-button" data-product-id="${product.id}">Edit Case Guarantees</button>`;
            }
            actionButtonsHtml += `<button class="btn btn-danger btn-sm delete-product-button ml-2" data-product-id="${product.id}">Delete</button>`;

            div.innerHTML = `
                <div>
                    <span class="font-semibold">${product.name}</span> (ID: ${product.id})<br>
                    <span class="text-xs text-slate-400">${details}</span>
                </div>
                <div class="flex items-center flex-wrap gap-1 mt-1 md:mt-0">
                    ${actionButtonsHtml}
                </div>`;
            productListContainer.appendChild(div);
        });
    },

    prepareProductFormForEdit: function(product) {
        if (!addProductForm || !newProductIdInput || !newProductNameInput || !newProductTypeSelect) return;

        appState.editingProductDetails = {
            productId: product.id,
            originalType: product.type,
            originalSlotConfiguration: product.slotConfiguration ? JSON.parse(JSON.stringify(product.slotConfiguration)) : [],
            // When product object comes from AppDB, it might have box_guarantees_config (parsed object)
            // or box_guarantees_json (string). We need to ensure we store the JSON string if available,
            // or stringify the config object if only that is available.
            // However, Product.fromPlainObject already stores box_guarantees_config as the parsed object.
            // So, we stringify it here for consistency when re-sending.
            originalBoxGuaranteesJson: product.box_guarantees_config ? JSON.stringify(product.box_guarantees_config) : JSON.stringify({rules:[], notes:""}),
            originalCaseGuaranteesJson: product.case_guarantees_config ? JSON.stringify(product.case_guarantees_config) : JSON.stringify({rules:[], notes:""})
        };

        newProductIdInput.value = product.id;
        newProductIdInput.readOnly = true;
        newProductIdInput.classList.add('bg-gray-600', 'cursor-not-allowed');

        newProductNameInput.value = product.name ? decodeURIComponent(product.name) : '';
        newProductTypeSelect.value = product.type;
        newProductTypeSelect.disabled = true;
        newProductTypeSelect.classList.add('bg-gray-600', 'cursor-not-allowed');

        this.toggleProductTypeFields();

        if (product.type === 'pack') {
            if(newProductCardsPerPackInput) newProductCardsPerPackInput.value = product.cards_per_pack || '';
        } else if (product.type === 'box') {
            if(newProductPacksPerBoxInput) newProductPacksPerBoxInput.value = product.packs_per_box || '';
            if(newProductPackProductIdInput) newProductPackProductIdInput.value = product.pack_product_id ? decodeURIComponent(product.pack_product_id) : '';
        } else if (product.type === 'case') {
            if(newProductBoxesPerCaseInput) newProductBoxesPerCaseInput.value = product.boxes_per_case || '';
            if(newProductBoxProductIdInput) newProductBoxProductIdInput.value = product.box_product_id ? decodeURIComponent(product.box_product_id) : '';
        }

        newProductNameInput.focus();
        const submitButton = addProductForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Product Details';
            submitButton.classList.remove('btn-primary');
            submitButton.classList.add('btn-success');
        }
    },

    resetProductForm: function() {
        if (!addProductForm || !newProductIdInput || !newProductTypeSelect) return;
        addProductForm.reset();
        newProductIdInput.readOnly = false;
        newProductIdInput.classList.remove('bg-gray-600', 'cursor-not-allowed');
        newProductTypeSelect.disabled = false;
        newProductTypeSelect.classList.remove('bg-gray-600', 'cursor-not-allowed');
        newProductTypeSelect.value = "";
        this.toggleProductTypeFields();

        const submitButton = addProductForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add Product';
            submitButton.classList.remove('btn-success');
            submitButton.classList.add('btn-primary');
        }
    },

populateGuaranteeTemplateSelect: function(templatesArray, selectElement) {
        if (!selectElement) {
            console.error("Template select element not provided to populateGuaranteeTemplateSelect. Element ID was:", selectElement); // Log the ID it tried to use
            return;
        }
        const currentVal = selectElement.value; // Preserve current selection if possible when re-populating
        selectElement.innerHTML = '<option value="">-- No Template Selected --</option>'; // Default option

        if (templatesArray && templatesArray.length > 0) {
            templatesArray.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                // Make the displayed text more informative
                option.textContent = `${template.name} (${template.scope})${template.description ? ` - ${template.description.substring(0, 40)}...` : ''}`;
                selectElement.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No templates available for this scope.";
            option.disabled = true;
            selectElement.appendChild(option);
        }
        // Try to re-select the previously selected value if it still exists in the new list
        if (selectElement.querySelector(`option[value="${currentVal}"]`)) {
            selectElement.value = currentVal;
        }
    },

    // --- Card UI ---
    populateCardRaritySelect: function(rarities) {
        if (!newCardRarityIdSelect) return;
        newCardRarityIdSelect.innerHTML = '<option value="">-- Select Rarity --</option>';
        if (rarities && rarities.length > 0) {
            rarities.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = `${r.name} (${r.id})`; newCardRarityIdSelect.appendChild(o); });
        } else newCardRarityIdSelect.innerHTML = '<option value="">-- No rarities in set --</option>';
    },

    renderCardList: function(cards, setRarities) {
        if (!cardListContainer) return; cardListContainer.innerHTML = '';
        if (!cards || cards.length === 0) { cardListContainer.innerHTML = '<p class="text-slate-400 col-span-full">No cards. Add one.</p>'; return; }

        cards.forEach(card => {
            const cardDiv = document.createElement('div'); cardDiv.className = 'card-list-item';
            const rarityInfo = setRarities.find(r => r.id === card.rarity_id);
            const rN = card.rarity_name || rarityInfo?.name || card.rarity_id;
            const rC = card.rarity_color_class || rarityInfo?.color_class || 'bg-gray-500 text-white';

            const cardDataAttrs = `
                data-card-id="${card.id}"
                data-card-name="${encodeURIComponent(card.name || '')}"
                data-rarity-id="${card.rarity_id || ''}"
                data-market-price="${card.market_price || 0}"
                data-image-url="${encodeURIComponent(card.image_url || '')}"
                data-card-number="${encodeURIComponent(card.card_number || '')}"
                data-set-id="${card.set_id || appState.activeSetId}"
            `.trim();

            cardDiv.innerHTML = `
                <div class="w-full">
                    <div class="flex justify-between items-start">
                        <span class="font-semibold text-sm">${card.name}</span>
                        <span class="px-2 py-0.5 text-xs rounded ${rC}">${rN}</span>
                    </div>
                    <p class="text-slate-400 text-xs">ID/No: ${card.id} ${card.card_number && card.card_number !== card.id ? `(Col: ${card.card_number})` : ''}</p>
                    ${card.image_url ? `<img src="${card.image_url}" alt="${encodeURIComponent(card.name)}" class="my-1 h-24 w-auto rounded object-contain self-center" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"> <div class="my-1 h-24 w-auto hidden items-center justify-center text-slate-500 text-xs">(Image load error)</div>` : '<div class="my-1 h-24 w-auto flex items-center justify-center text-slate-500 text-xs">(No Image)</div>'}
                    <p class="text-green-400 text-xs">Price: $${(card.market_price || 0).toFixed(2)}</p>
                </div>
                <div class="mt-1 self-end flex gap-2">
                    <button class="btn btn-sm btn-primary edit-card-button" ${cardDataAttrs}>Edit</button>
                    <button class="btn btn-danger btn-sm delete-card-button" data-card-id="${card.id}" data-set-id="${card.set_id || appState.activeSetId}">Delete</button>
                </div>`;
            cardListContainer.appendChild(cardDiv);
        });
    },

    prepareCardFormForEdit: function(cardDetails) {
        if (!addCardForm || !newCardIdInput || !newCardNameInput || !newCardRarityIdSelect || !newCardMarketPriceInput || !newCardImageUrlInput || !newCardCardNumberInput) {
            console.error("One or more card form elements not found for editing.");
            this.showStatus("Error: Card form elements missing.", "error");
            return;
        }

        newCardIdInput.value = cardDetails.cardId;
        newCardIdInput.readOnly = true;
        newCardIdInput.classList.add('bg-gray-600', 'cursor-not-allowed');

        newCardNameInput.value = decodeURIComponent(cardDetails.cardName);
        newCardRarityIdSelect.value = cardDetails.rarityId;
        newCardMarketPriceInput.value = cardDetails.marketPrice;
        newCardImageUrlInput.value = decodeURIComponent(cardDetails.imageUrl);
        newCardCardNumberInput.value = decodeURIComponent(cardDetails.cardNumber);

        newCardNameInput.focus();

        const submitButton = addCardForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Card';
            submitButton.classList.remove('btn-primary');
            submitButton.classList.add('btn-success');
        }
    },

    resetCardForm: function() {
        if (!addCardForm || !newCardIdInput || !newCardNameInput) {
            console.warn("Card form elements not fully available for reset.");
            if(addCardForm) addCardForm.reset();
            return;
        }
        addCardForm.reset();
        newCardIdInput.readOnly = false;
        newCardIdInput.classList.remove('bg-gray-600', 'cursor-not-allowed');
        const submitButton = addCardForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add Card to Set';
            submitButton.classList.remove('btn-success');
            submitButton.classList.add('btn-primary');
        }
        if(newCardRarityIdSelect) newCardRarityIdSelect.value = "";
    },

    // --- Pack Configuration Editor UI ---
    displayPackConfigEditorUI: function(product, setRarities) {
        if (!packConfigEditorEl || !editingProductNameEl || !cardsPerPackInput || !slotConfigurationContainer) return;
        if (!product || product.type !== 'pack') { packConfigEditorEl.classList.add('hidden'); this.showStatus("Selected product is not a pack or not found.", "error"); return; }

        editingProductNameEl.textContent = product.name;
        cardsPerPackInput.value = product.cards_per_pack || 0;
        cardsPerPackInput.readOnly = false;
        slotConfigurationContainer.innerHTML = '';

        if (!setRarities || setRarities.length === 0) { this.showStatus("No rarities in the current set. Add rarities first to configure pack slots.", "warning"); }

        (product.slotConfiguration || []).forEach((slot, index) => {
            this.addSlotToForm(slot, index, setRarities);
        });
        packConfigEditorEl.classList.remove('hidden');
        this.showStatus(`Editing pack configuration for ${product.name}.`, 'info');
    },

    addSlotToForm: function(slotData = { type: 'fixed', count: 1, fixed_rarity_id: '', pool: [] }, slotIndex, setRarities) {
        if (!slotConfigurationContainer) return;
        const slotDiv = document.createElement('div'); slotDiv.className = 'slot-config border p-3 rounded mb-3 bg-gray-700';
        slotDiv.dataset.slotIndex = slotIndex;

        slotDiv.innerHTML = `
            <h4 class="text-md font-medium mb-2 text-indigo-300">Slot ${slotConfigurationContainer.children.length + 1}</h4>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                    <label for="slotType_${slotIndex}">Type:</label>
                    <select id="slotType_${slotIndex}" class="input-field slot-type-select">
                        <option value="fixed" ${slotData.type === 'fixed' ? 'selected' : ''}>Fixed</option>
                        <option value="pool" ${slotData.type === 'pool' ? 'selected' : ''}>Pool</option>
                    </select>
                </div>
                <div>
                    <label for="slotCount_${slotIndex}">Count:</label>
                    <input type="number" id="slotCount_${slotIndex}" class="input-field slot-count-input" value="${slotData.count || 1}" min="1" required>
                </div>
                <div class="flex items-end">
                    <button type="button" class="btn btn-danger remove-slot-button">Remove Slot</button>
                </div>
            </div>
            <div id="slotDetails_${slotIndex}" class="mt-3"></div>`;
        slotConfigurationContainer.appendChild(slotDiv);

        const slotTypeSelect = slotDiv.querySelector(`#slotType_${slotIndex}`);
        const slotDetailsContainer = slotDiv.querySelector(`#slotDetails_${slotIndex}`);
        const removeSlotButton = slotDiv.querySelector('.remove-slot-button');

        removeSlotButton.addEventListener('click', () => {
            slotDiv.remove();
        });

        const renderSlotDetails = () => {
            slotDetailsContainer.innerHTML = '';
            const currentType = slotTypeSelect.value;
            if (currentType === 'fixed') {
                if (!setRarities || setRarities.length === 0) { slotDetailsContainer.innerHTML = '<p class="text-red-400 text-xs">No rarities in set. Add rarities first.</p>'; return; }
                let rOpts = setRarities.map(r => `<option value="${r.id}" ${slotData.fixed_rarity_id === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>`).join('');
                slotDetailsContainer.innerHTML = `<div><label for="slotRarity_${slotIndex}">Rarity:</label><select id="slotRarity_${slotIndex}" class="input-field slot-rarity-input"><option value="">--Select Rarity--</option>${rOpts}</select></div>`;
                if (slotData.fixed_rarity_id && slotDetailsContainer.querySelector('select')) {
                    slotDetailsContainer.querySelector('select').value = slotData.fixed_rarity_id;
                }
            } else if (currentType === 'pool') {
                if (!setRarities || setRarities.length === 0) { slotDetailsContainer.innerHTML = '<p class="text-red-400 text-xs">No rarities in set. Add rarities first.</p>'; return; }
                let poolItemsHtml = (slotData.pool || []).map((pItem, pIdx) => `
                    <div class="pool-item-config grid grid-cols-3 gap-2 items-center mb-2" data-pool-item-index="${pIdx}">
                        <div>
                            <label class="text-xs">Rarity:</label>
                            <select class="input-field pool-item-rarity">
                                <option value="">--Select--</option>
                                ${setRarities.map(r => `<option value="${r.id}" ${pItem.rarity_id === r.id ? 'selected' : ''}>${r.name} (${r.id})</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="text-xs">Weight:</label>
                            <input type="number" class="input-field pool-item-weight" value="${pItem.weight || 1}" min="1" required>
                        </div>
                        <button type="button" class="btn btn-danger btn-sm remove-pool-item-button text-xs py-1">Remove</button>
                    </div>`).join('');
                slotDetailsContainer.innerHTML = `<h5 class="text-sm font-medium mb-1 text-slate-400">Pool Items:</h5><div class="poolItemsContainer">${poolItemsHtml}</div><button type="button" class="btn btn-secondary btn-sm add-pool-item-button mt-1 text-xs py-1">Add Rarity to Pool</button>`;

                slotDetailsContainer.querySelector('.add-pool-item-button').addEventListener('click', () => {
                    const poolItemsDiv = slotDetailsContainer.querySelector('.poolItemsContainer');
                    const newPoolItemDiv = document.createElement('div');
                    newPoolItemDiv.className = 'pool-item-config grid grid-cols-3 gap-2 items-center mb-2';
                    newPoolItemDiv.innerHTML = `
                        <div>
                            <label class="text-xs">Rarity:</label>
                            <select class="input-field pool-item-rarity">
                                <option value="">--Select--</option>
                                ${setRarities.map(r => `<option value="${r.id}">${r.name} (${r.id})</option>`).join('')}</select>
                        </div>
                        <div><label class="text-xs">Weight:</label><input type="number" class="input-field pool-item-weight" value="1" min="1" required></div>
                        <button type="button" class="btn btn-danger btn-sm remove-pool-item-button text-xs py-1">Remove</button>`;
                    newPoolItemDiv.querySelector('.remove-pool-item-button').addEventListener('click', () => newPoolItemDiv.remove());
                    poolItemsDiv.appendChild(newPoolItemDiv);
                });
                slotDetailsContainer.querySelectorAll('.remove-pool-item-button').forEach(btn => btn.addEventListener('click', (e) => e.target.closest('.pool-item-config').remove()));
            }
        };
        slotTypeSelect.addEventListener('change', renderSlotDetails);
        renderSlotDetails();
    },

    // --- Guarantee Template UI (NEW) ---
    populateGuaranteeTemplateSelect: function(templatesArray, selectElement) {
        if (!selectElement) {
            console.error("Template select element not provided to populateGuaranteeTemplateSelect.");
            return;
        }
        selectElement.innerHTML = '<option value="">-- No Template Selected --</option>'; // Default option
        if (templatesArray && templatesArray.length > 0) {
            templatesArray.forEach(template => {
                const option = document.createElement('option');
                option.value = template.id;
                option.textContent = template.name + (template.description ? ` (${template.description})` : '');
                selectElement.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "No templates available for this scope.";
            option.disabled = true;
            selectElement.appendChild(option);
        }
    },

    // --- Guarantee Editor UI ---
    openBoxGuaranteeEditor: function(product, raritiesInSet) {
        if (!boxGuaranteeEditorSection || !editingBoxProductNameEl || !boxNotesInput || !boxGuaranteeRulesContainer) {
            console.error("Box guarantee editor DOM elements not found.");
            return;
        }
        if (!product || product.type !== 'box') {
            this.showStatus("Selected product is not a box or not found.", "error");
            return;
        }

        appState.activeProductForBoxGuarantees = product;
        appState.activeProductForCaseGuarantees = null;
        appState.activeRuleBeingEditedFor = 'product'; // Set context for rule saving

        editingBoxProductNameEl.textContent = product.name;
        boxNotesInput.value = product.box_guarantees_config?.notes || "";
        this.renderGuaranteeRuleList(product.box_guarantees_config?.rules || [], boxGuaranteeRulesContainer, 'box', raritiesInSet);

        // VVVVVV ADD THIS LINE VVVVVV
        if (typeof appActions !== 'undefined' && appActions.loadAndPopulateGuaranteeTemplates) {
            appActions.loadAndPopulateGuaranteeTemplates('box', 'boxGuaranteeTemplateSelect');
        }
        // ^^^^^^ ADD THIS LINE ^^^^^^

        boxGuaranteeEditorSection.classList.remove('hidden');
        if (caseGuaranteeEditorSection) caseGuaranteeEditorSection.classList.add('hidden');
        if (packConfigEditorEl) packConfigEditorEl.classList.add('hidden');
        this.showStatus(`Editing guarantees for box: ${product.name}. Select a template or add rules manually.`, 'info');
    },

    openCaseGuaranteeEditor: function(product, raritiesInSet) {
        if (!caseGuaranteeEditorSection || !editingCaseProductNameEl || !caseNotesInput || !caseGuaranteeRulesContainer) {
            console.error("Case guarantee editor DOM elements not found.");
            return;
        }
        if (!product || product.type !== 'case') {
            this.showStatus("Selected product is not a case or not found.", "error");
            return;
        }

        appState.activeProductForCaseGuarantees = product;
        appState.activeProductForBoxGuarantees = null;
        appState.activeRuleBeingEditedFor = 'product'; // Set context for rule saving

        editingCaseProductNameEl.textContent = product.name;
        caseNotesInput.value = product.case_guarantees_config?.notes || "";
        this.renderGuaranteeRuleList(product.case_guarantees_config?.rules || [], caseGuaranteeRulesContainer, 'case', raritiesInSet);

        // VVVVVV ADD THIS LINE VVVVVV
        if (typeof appActions !== 'undefined' && appActions.loadAndPopulateGuaranteeTemplates) {
            appActions.loadAndPopulateGuaranteeTemplates('case', 'caseGuaranteeTemplateSelect');
        }
        // ^^^^^^ ADD THIS LINE ^^^^^^

        caseGuaranteeEditorSection.classList.remove('hidden');
        if (boxGuaranteeEditorSection) boxGuaranteeEditorSection.classList.add('hidden');
        if (packConfigEditorEl) packConfigEditorEl.classList.add('hidden');
        this.showStatus(`Editing guarantees for case: ${product.name}. Select a template or add rules manually.`, 'info');
    },

    renderGuaranteeRuleList: function(rulesArray, containerElement, scope, raritiesInSet) {
        if (!containerElement) return;
        containerElement.innerHTML = '';
        if (!rulesArray || rulesArray.length === 0) {
            containerElement.innerHTML = `<p class="text-slate-400">No guarantee rules defined yet for this ${scope}.</p>`;
            return;
        }
        rulesArray.forEach((rule, index) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.className = 'list-item p-2 flex-wrap';
            ruleDiv.innerHTML = `
                <div class="flex-grow">
                    <strong class="text-indigo-300">${rule.description || rule.id || `Rule ${index + 1}`}</strong>
                    <span class="text-xs text-slate-400">(Type: ${rule.type})</span>
                    <p class="text-xs text-slate-500">
                        Count: ${JSON.stringify(rule.count || {}).replace(/"/g, '').replace(/{/g,'').replace(/}/g,'')} |
                        Targets: ${(rule.targetRarityIds || []).join(', ') || (rule.targetCardIds || []).join(', ') || 'N/A'}
                    </p>
                </div>
                <div class="flex gap-2 mt-2 md:mt-0">
                    <button class="btn btn-sm btn-secondary edit-guarantee-rule-button" data-index="${index}" data-scope="${scope}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-guarantee-rule-button" data-index="${index}" data-scope="${scope}">Delete</button>
                </div>`;
            ruleDiv.querySelector('.edit-guarantee-rule-button').addEventListener('click', () => this.openRuleForm(rule, index, scope, raritiesInSet));
            ruleDiv.querySelector('.delete-guarantee-rule-button').addEventListener('click', () => this.deleteGuaranteeRuleFromList(index, scope, raritiesInSet));
            containerElement.appendChild(ruleDiv);
        });
    },

    openRuleForm: function(ruleData = null, ruleIndex = -1, scope, raritiesInSet) {
        if (!guaranteeRuleFormModal || !ruleTargetRaritySelectContainer || !ruleTargetRarityTextContainer) {
            console.error("Guarantee rule form modal or rarity containers not found!");
            return;
        }

        const isTemplateContext = (appState.activeRuleBeingEditedFor === 'template');

        // Set up appState for context
        if (isTemplateContext) {
            appState.activeRuleBeingEditedForTemplateContext = { ruleIndex: ruleIndex, scope: scope };
        } else {
            appState.activeRuleBeingEditedFor = 'product'; // Default or ensure it's set for product
        }
         appState.activeRuleBeingEdited = {
            index: ruleIndex,
            data: ruleData ? JSON.parse(JSON.stringify(ruleData)) : this.createNewRuleTemplate(scope),
            scope: scope
        };


        ruleFormTitle.textContent = ruleIndex === -1 ? `Add New ${scope === 'box' ? 'Box' : 'Case'} Guarantee Rule` : `Edit ${scope === 'box' ? 'Box' : 'Case'} Guarantee Rule`;
        editingRuleIndexInput.value = ruleIndex;
        editingRuleScopeInput.value = scope;

        const currentRule = appState.activeRuleBeingEdited.data;
        ruleIdInput.value = currentRule.id || `rule_${Date.now()}`;
        ruleDescriptionInput.value = currentRule.description || '';
        ruleTypeSelect.value = currentRule.type || 'atLeast';

        // Toggle visibility of rarity input methods
        ruleTargetRaritySelectContainer.classList.toggle('hidden', isTemplateContext);
        ruleTargetRarityTextContainer.classList.toggle('hidden', !isTemplateContext);

        if (isTemplateContext) {
            ruleTargetRarityIdsTextarea.value = (currentRule.targetRarityIds || []).join(', ');
        } else {
            ruleTargetRarityIdsSelect.innerHTML = ''; // Clear previous options
            if (raritiesInSet && raritiesInSet.length > 0) {
                raritiesInSet.forEach(r => {
                    const opt = document.createElement('option');
                    opt.value = r.id;
                    opt.textContent = `${r.name} (${r.id})`;
                    if (currentRule.targetRarityIds && currentRule.targetRarityIds.includes(r.id)) {
                        opt.selected = true;
                    }
                    ruleTargetRarityIdsSelect.appendChild(opt);
                });
            } else {
                const opt = document.createElement('option');
                opt.textContent = "No rarities available for selection in active set.";
                opt.disabled = true;
                ruleTargetRarityIdsSelect.appendChild(opt);
            }
        }

        ruleTargetCardIdsInput.value = (currentRule.targetCardIds || []).join(',');

        this.updateRuleFormFieldVisibility(); // This uses appState.activeRuleBeingEdited.scope
        guaranteeRuleFormModal.classList.remove('hidden');
    },

    saveRuleFromFormToList: function() {
        const index = parseInt(editingRuleIndexInput.value);
        const scopeFromModal = editingRuleScopeInput.value;
        const isTemplateContext = (appState.activeRuleBeingEditedFor === 'template');

        let targetRarityIdsFromForm;
        if (isTemplateContext) {
            targetRarityIdsFromForm = ruleTargetRarityIdsTextarea.value.trim() ? ruleTargetRarityIdsTextarea.value.split(',').map(id => id.trim()).filter(id => id) : [];
        } else {
            targetRarityIdsFromForm = Array.from(ruleTargetRarityIdsSelect.selectedOptions).map(opt => opt.value);
        }

        const newRule = {
            id: ruleIdInput.value.trim() || `rule_${Date.now()}`,
            description: ruleDescriptionInput.value.trim(),
            type: ruleTypeSelect.value,
            targetRarityIds: targetRarityIdsFromForm, // Use the correctly sourced IDs
            targetCardIds: ruleTargetCardIdsInput.value.trim() ? ruleTargetCardIdsInput.value.split(',').map(id => id.trim()).filter(id => id) : [],
            count: {},
            scope: scopeFromModal === 'box' ? 'perBox' : 'perCase'
        };

        // --- Basic Validations ---
        if (!newRule.id || !newRule.description || !newRule.type) { /* ... error ... */ return false; }
        if (newRule.type !== 'boxTopper' && newRule.targetRarityIds.length === 0 && newRule.targetCardIds.length === 0) {
            /* ... error ... */ return false;
        }

        // --- Type-Specific Logic & Validation (as before) ---
        // (Ensure this part correctly populates newRule.count or newRule.details based on newRule.type)
        // ... (atLeast, atMost, exact, range, average, chase logic) ...
        if (newRule.type === "atLeast") { const min = parseInt(ruleCountMinInput.value); if (isNaN(min) || min < 0) { this.showStatus("Valid Min Count.", "error"); return false; } newRule.count.min = min; }
        else if (newRule.type === "atMost") { const max = parseInt(ruleCountMaxInput.value); if (isNaN(max) || max < 0) { this.showStatus("Valid Max Count.", "error"); return false; } newRule.count.max = max; }
        else if (newRule.type === "exact") { const exact = parseInt(ruleCountExactInput.value); if (isNaN(exact) || exact < 0) { this.showStatus("Valid Exact Count.", "error"); return false; } newRule.count.exact = exact; }
        else if (newRule.type === "range") { const min = parseInt(ruleCountMinInput.value); const max = parseInt(ruleCountMaxInput.value); if (isNaN(min) || min < 0 || isNaN(max) || max < 0) { this.showStatus("Valid Min & Max Counts.", "error"); return false; } if (min > max) { this.showStatus("Min > Max.", "error"); return false; } newRule.count.min = min; newRule.count.max = max; }
        else if (newRule.type === "average") { const avg = parseFloat(ruleCountTargetAverageInput.value); if (isNaN(avg) || avg < 0) { this.showStatus("Valid Target Average.", "error"); return false; } newRule.count.targetAverage = avg; }
        else if (newRule.type === "chase") { const chance = parseFloat(ruleChaseChanceInput.value); const hits = parseInt(ruleChaseGuaranteedIfHitInput.value); if (isNaN(chance) || chance < 0 || chance > 1) { this.showStatus("Valid Chance (0-1).", "error"); return false; } if (isNaN(hits) || hits < 1) { this.showStatus("Valid Guaranteed Hits (>=1).", "error"); return false; } newRule.chance = chance; newRule.guaranteedIfHit = hits; newRule.addsToTotal = ruleChaseAddsToTotalInput.checked; delete newRule.count; }
        else if (newRule.type === "boxTopper" && newRule.scope === 'perBox') { // Check newRule.scope
            const quantity = parseInt(ruleBTQuantityInput.value);
            const sourcePackId = ruleBTSourcePackProductIdInput.value.trim();
            if (!sourcePackId) { this.showStatus("Source Pack Product ID is required for Box Topper rules.", "error"); return false; }
            if (isNaN(quantity) || quantity < 1) { this.showStatus("Quantity for Box Topper must be at least 1.", "error"); return false; }
            newRule.details = { quantity: quantity, sourcePackProductId: sourcePackId };
            delete newRule.count; newRule.targetRarityIds = []; newRule.targetCardIds = []; // Clear these as they are not used
        } else if (newRule.type === "boxTopper" && newRule.scope !== 'perBox') {
             this.showStatus("Box Topper rule type is only applicable to 'perBox' scope.", "error"); return false;
        }


        if (appState.activeRuleBeingEditedFor === 'template') {
            if (typeof templateManager !== 'undefined' && typeof templateManager.saveRuleToCurrentTemplateList === 'function') {
                const { ruleIndex: templateRuleIndex } = appState.activeRuleBeingEditedForTemplateContext;
                templateManager.saveRuleToCurrentTemplateList(newRule, templateRuleIndex);
            } else { /* ... error handling ... */ return false; }
        } else {
            // ... (existing logic for saving to product guarantees) ...
            const product = scopeFromModal === 'box' ? appState.activeProductForBoxGuarantees : appState.activeProductForCaseGuarantees;
            if (!product) { this.showStatus("No active product selected.", "error"); return false; }
            const guaranteeConfig = scopeFromModal === 'box' ? product.box_guarantees_config : product.case_guarantees_config;
            if (!guaranteeConfig.rules) guaranteeConfig.rules = [];
            if (index === -1) { guaranteeConfig.rules.push(newRule); }
            else { guaranteeConfig.rules[index] = newRule; }

            const currentSet = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
            const raritiesInSet = currentSet?.rarities || [];
            if (scopeFromModal === 'box') this.renderGuaranteeRuleList(guaranteeConfig.rules, boxGuaranteeRulesContainer, 'box', raritiesInSet);
            else this.renderGuaranteeRuleList(guaranteeConfig.rules, caseGuaranteeRulesContainer, 'case', raritiesInSet);
            this.showStatus(`Rule '${newRule.description || newRule.id}' ${index === -1 ? 'added to' : 'updated in'} product's list. Remember to "Save All Guarantees".`, "info");
        }

        if (guaranteeRuleFormModal) guaranteeRuleFormModal.classList.add('hidden');
        appState.activeRuleBeingEditedFor = null;
        appState.activeRuleBeingEditedForTemplateContext = null;
        return true;
    },

    deleteGuaranteeRuleFromList: function(index, scope, raritiesInSet) {
        const product = scope === 'box' ? appState.activeProductForBoxGuarantees : appState.activeProductForCaseGuarantees;
        if (!product) return;
        const guaranteeConfig = scope === 'box' ? product.box_guarantees_config : product.case_guarantees_config;

        if (guaranteeConfig && guaranteeConfig.rules && guaranteeConfig.rules[index] !== undefined) {
            if (confirm(`Are you sure you want to delete the rule: "${guaranteeConfig.rules[index].description || guaranteeConfig.rules[index].id}"? This only removes it from the current list. Click "Save All" to make it permanent.`)) {
                guaranteeConfig.rules.splice(index, 1);
                if (scope === 'box') this.renderGuaranteeRuleList(guaranteeConfig.rules, boxGuaranteeRulesContainer, 'box', raritiesInSet);
                else this.renderGuaranteeRuleList(guaranteeConfig.rules, caseGuaranteeRulesContainer, 'case', raritiesInSet);
                this.showStatus("Rule removed from list. Remember to 'Save All ... Guarantees'.", "info");
            }
        }
    }
};