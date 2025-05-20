// scripts/templateManager.js

// Globally accessible DOM elements (assigned in app.js)
let templateManagementSection, addEditTemplateFormContainer, templateFormTitle, addEditTemplateForm,
    templateIdInput, templateNameInput, templateDescriptionInput, templateScopeSelect,
    saveTemplateButton, cancelEditTemplateButton, showAddTemplateFormButton,
    filterTemplateScopeSelect, templateListContainer,
    templateRulesManagementSection, editingTemplateNameDisplay, templateRulesContainer,
    addNewRuleToTemplateButton, saveAllRulesToTemplateButton, closeTemplateRulesEditorButton;

// State specific to template management
const templateManagerState = {
    editingTemplateId: null,
    currentTemplateRules: [],
    currentTemplateScopeForRules: 'box'
};

const templateManager = { // <<-- This line is crucial
    init: function() {
        console.log("Template Manager Initializing...");
        // Assign DOM elements (will be done in app.js DOMContentLoaded and passed or made global)

        // Attach event listeners specific to this section
        showAddTemplateFormButton?.addEventListener('click', () => this.showAddTemplateDetailsForm());
        addEditTemplateForm?.addEventListener('submit', (e) => this.handleSaveTemplateDetailsForm(e));
        cancelEditTemplateButton?.addEventListener('click', () => this.resetTemplateDetailsForm());
        filterTemplateScopeSelect?.addEventListener('change', () => this.loadAndDisplayTemplates());
        templateListContainer?.addEventListener('click', (e) => this.handleTemplateListClick(e));

        addNewRuleToTemplateButton?.addEventListener('click', () => this.openRuleModalForTemplate());
        saveAllRulesToTemplateButton?.addEventListener('click', () => this.handleSaveAllRulesToTemplate());
        closeTemplateRulesEditorButton?.addEventListener('click', () => this.closeRulesEditor());


        this.loadAndDisplayTemplates(); // Initial load
    },

    loadAndDisplayTemplates: async function() {
        const filterScope = filterTemplateScopeSelect.value; // This is the scope value
        uiManager.showStatus("Loading guarantee templates...", "info", 0);
        try {
            // The 'filterScope' variable from the dropdown is passed here
            const templates = await apiService.fetchGuaranteeTemplates(filterScope);
            this.renderTemplateList(templates || []);
            uiManager.showStatus("Templates loaded.", "success", 2000);
        } catch (error) {
            console.error("Error loading templates:", error);
            uiManager.showStatus(`Error loading templates: ${error.message}`, "error");
            if (templateListContainer) templateListContainer.innerHTML = '<p class="text-red-400">Could not load templates.</p>';
        }
    },

    renderTemplateList: function(templates) {
        templateListContainer.innerHTML = "";
        if (!templates || templates.length === 0) {
            templateListContainer.innerHTML = '<p class="text-slate-400">No templates found for this scope.</p>';
            return;
        }
        templates.forEach(template => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.innerHTML = `
                <div class="flex-grow">
                    <strong class="text-indigo-400">${template.name}</strong> (${template.scope})
                    <p class="text-xs text-slate-400">${template.description || 'No description'}</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button class="btn btn-sm btn-secondary edit-template-details-button" data-template-id="${template.id}">Edit Details</button>
                    <button class="btn btn-sm btn-secondary manage-template-rules-button" data-template-id="${template.id}" data-template-name="${encodeURIComponent(template.name)}" data-template-scope="${template.scope}">Manage Rules</button>
                    <button class="btn btn-sm btn-danger delete-template-button" data-template-id="${template.id}" data-template-name="${encodeURIComponent(template.name)}">Delete</button>
                </div>
            `;
            templateListContainer.appendChild(item);
        });
    },

    showAddTemplateDetailsForm: function() {
        this.resetTemplateDetailsForm(); // Clear form for adding new
        templateFormTitle.textContent = "Add New Guarantee Template";
        saveTemplateButton.textContent = "Save Template";
        addEditTemplateFormContainer.classList.remove('hidden');
        templateRulesManagementSection.classList.add('hidden'); // Hide rules editor if it was open
        templateNameInput.focus();
    },

    prepareTemplateDetailsFormForEdit: function(template) {
        templateManagerState.editingTemplateId = template.id;
        templateIdInput.value = template.id;
        templateNameInput.value = decodeURIComponent(template.name || '');
        templateDescriptionInput.value = decodeURIComponent(template.description || '');
        templateScopeSelect.value = template.scope;
        templateScopeSelect.disabled = true; // Scope generally shouldn't change after creation

        templateFormTitle.textContent = `Edit Template: ${decodeURIComponent(template.name)}`;
        saveTemplateButton.textContent = "Update Template Details";
        cancelEditTemplateButton.classList.remove('hidden');
        addEditTemplateFormContainer.classList.remove('hidden');
        templateNameInput.focus();
    },

    resetTemplateDetailsForm: function() {
        addEditTemplateForm.reset();
        templateManagerState.editingTemplateId = null;
        templateIdInput.value = '';
        templateScopeSelect.disabled = false;
        templateFormTitle.textContent = "Add New Guarantee Template";
        saveTemplateButton.textContent = "Save Template";
        cancelEditTemplateButton.classList.add('hidden');
        addEditTemplateFormContainer.classList.add('hidden');
    },

    handleSaveTemplateDetailsForm: async function(event) {
        event.preventDefault();
        const id = templateManagerState.editingTemplateId;
        const name = templateNameInput.value.trim();
        const description = templateDescriptionInput.value.trim();
        const scope = templateScopeSelect.value;

        if (!name || !scope) {
            uiManager.showStatus("Template Name and Scope are required.", "error");
            return;
        }

        const templateData = { name, description, scope };

        try {
            if (id) { // Editing existing
                uiManager.showStatus(`Updating template '${name}'...`, "info", 0);
                await apiService.updateGuaranteeTemplate(id, templateData); // This PUT currently updates rules too if sent
                uiManager.showStatus(`Template '${name}' details updated.`, "success");
            } else { // Adding new
                uiManager.showStatus(`Adding new template '${name}'...`, "info", 0);
                // For a new template, we'll save details first, then user can add rules.
                // Or, if we want to allow adding rules directly, the form needs a way to build them.
                // For now, new templates are created with empty rules via this form.
                templateData.rules = []; // Send with empty rules initially
                await apiService.createGuaranteeTemplate(templateData);
                uiManager.showStatus(`Template '${name}' added. You can now manage its rules.`, "success");
            }
            this.resetTemplateDetailsForm();
            this.loadAndDisplayTemplates(); // Refresh the list
        } catch (error) {
            console.error("Error saving template details:", error);
            uiManager.showStatus(`Error: ${error.message}`, "error");
        }
    },

    handleTemplateListClick: async function(event) {
        const button = event.target.closest('button');
        if (!button) return;

        const templateId = button.dataset.templateId;

        if (button.classList.contains('edit-template-details-button')) {
            uiManager.showStatus(`Loading details for template ID: ${templateId}...`, "info", 0);
            try {
                const template = await apiService.fetchGuaranteeTemplateDetails(templateId); // Fetches details AND rules
                this.prepareTemplateDetailsFormForEdit(template);
                templateRulesManagementSection.classList.add('hidden'); // Hide rules editor for now
            } catch (error) {
                uiManager.showStatus(`Error loading template details: ${error.message}`, "error");
            }
        } else if (button.classList.contains('manage-template-rules-button')) {
            const templateName = button.dataset.templateName;
            const templateScope = button.dataset.templateScope;
            this.loadRulesForTemplate(templateId, templateName, templateScope);
        } else if (button.classList.contains('delete-template-button')) {
            const templateName = button.dataset.templateName;
            if (confirm(`Are you sure you want to delete template '${decodeURIComponent(templateName)}'? This cannot be undone.`)) {
                this.handleDeleteTemplate(templateId);
            }
        }
    },

    handleDeleteTemplate: async function(templateId) {
        uiManager.showStatus(`Deleting template ID: ${templateId}...`, "info", 0);
        try {
            await apiService.deleteGuaranteeTemplate(templateId);
            uiManager.showStatus("Template deleted successfully.", "success");
            this.loadAndDisplayTemplates(); // Refresh list
            if (templateManagerState.editingTemplateId === templateId ||
                (templateRulesManagementSection.dataset.editingTemplateId === templateId && !templateRulesManagementSection.classList.contains('hidden'))) {
                this.resetTemplateDetailsForm();
                this.closeRulesEditor();
            }
        } catch (error) {
            console.error("Error deleting template:", error);
            uiManager.showStatus(`Error deleting template: ${error.message}`, "error");
        }
    },

    // --- Methods for Managing Rules WITHIN a Template ---
    loadRulesForTemplate: async function(templateId, templateName, templateScope) {
        uiManager.showStatus(`Loading rules for template: ${decodeURIComponent(templateName)}...`, "info", 0);
        addEditTemplateFormContainer.classList.add('hidden'); // Hide main details form
        try {
            const templateDetails = await apiService.fetchGuaranteeTemplateDetails(templateId);
            templateManagerState.editingTemplateId = templateId; // Set which template's rules are being edited
            templateManagerState.currentTemplateRules = templateDetails.rules ? JSON.parse(JSON.stringify(templateDetails.rules)) : []; // Store a mutable copy
            templateManagerState.currentTemplateScopeForRules = templateScope;

            editingTemplateNameDisplay.textContent = decodeURIComponent(templateName);
            this.renderTemplateRuleList(templateManagerState.currentTemplateRules, templateScope);
            templateRulesManagementSection.classList.remove('hidden');
            templateRulesManagementSection.dataset.editingTemplateId = templateId; // Store ID for reference
            templateRulesManagementSection.scrollIntoView({behavior: "smooth"});
            uiManager.showStatus(`Editing rules for '${decodeURIComponent(templateName)}'.`, "info");
        } catch (error) {
            console.error("Error loading template rules:", error);
            uiManager.showStatus(`Error loading rules: ${error.message}`, "error");
        }
    },

    renderTemplateRuleList: function(rules, scope) {
        templateRulesContainer.innerHTML = "";
        if (!rules || rules.length === 0) {
            templateRulesContainer.innerHTML = '<p class="text-slate-400">No rules defined for this template yet.</p>';
            return;
        }
        // This can reuse or adapt uiManager.renderGuaranteeRuleList, but actions are different
        rules.forEach((rule, index) => {
            const ruleDiv = document.createElement('div');
            ruleDiv.className = 'list-item p-2 flex-wrap';
            ruleDiv.innerHTML = `
                <div class="flex-grow">
                    <strong class="text-indigo-300">${rule.description || rule.id || `Rule ${index + 1}`}</strong>
                    <span class="text-xs text-slate-400">(Type: ${rule.type})</span>
                    <p class="text-xs text-slate-500">
                        ${JSON.stringify(rule.count || rule.chance || rule.details || {}).replace(/"/g, '').replace(/{/g,'').replace(/}/g,'')} |
                        Targets: ${(rule.targetRarityIds || []).join(', ') || (rule.targetCardIds || []).join(', ') || 'N/A'}
                    </p>
                </div>
                <div class="flex gap-2 mt-2 md:mt-0">
                    <button class="btn btn-sm btn-secondary edit-template-rule-button" data-index="${index}">Edit</button>
                    <button class="btn btn-sm btn-danger delete-template-rule-button" data-index="${index}">Delete</button>
                </div>
            `;
            ruleDiv.querySelector('.edit-template-rule-button').addEventListener('click', () => {
                // Pass a copy of the rule to avoid direct mutation before saving
                this.openRuleModalForTemplate(JSON.parse(JSON.stringify(rule)), index, scope);
            });
            ruleDiv.querySelector('.delete-template-rule-button').addEventListener('click', () => {
                this.deleteRuleFromTemplateList(index, scope);
            });
            templateRulesContainer.appendChild(ruleDiv);
        });
    },

    openRuleModalForTemplate: function(ruleData = null, ruleIndex = -1, currentTemplateScope) {
        appState.activeRuleBeingEditedFor = 'template'; // CRITICAL: Set context
        appState.activeRuleBeingEditedForTemplateContext = { ruleIndex: ruleIndex, scope: currentTemplateScope };

        const activeSetForRarities = AppDB.getTCGById(appState.activeTCGId)?.getSetById(appState.activeSetId);
        const raritiesForModal = activeSetForRarities?.rarities || [];
        
        if (raritiesForModal.length === 0 && (ruleData ? ruleData.type !== 'boxTopper' : true) ) {
            uiManager.showStatus("Warning: No rarities loaded for the currently active TCG/Set. Rarity ID input for template rule will be manual.", "warning", 7000);
        }
        // The last argument (raritiesForModal) will be used by openRuleForm IF it's not in template context.
        // For template context, openRuleForm will now show the textarea.
        uiManager.openRuleForm(ruleData, ruleIndex, currentTemplateScope, raritiesForModal);
    },

    // Called by the global rule modal's save button IF appState.activeRuleBeingEditedFor === 'template'
    saveRuleToCurrentTemplateList: function(ruleObject, originalIndex) {
        if (originalIndex === -1) { // New rule
            templateManagerState.currentTemplateRules.push(ruleObject);
        } else { // Editing existing
            templateManagerState.currentTemplateRules[originalIndex] = ruleObject;
        }
        this.renderTemplateRuleList(templateManagerState.currentTemplateRules, templateManagerState.currentTemplateScopeForRules);
        uiManager.showStatus("Rule updated in template list. Click 'Save All Rules to Template' to persist.", "info");
    },


    deleteRuleFromTemplateList: function(index, scope) {
        if (confirm("Are you sure you want to remove this rule from the template list? (Changes are not saved until you click 'Save All Rules to Template')")) {
            templateManagerState.currentTemplateRules.splice(index, 1);
            this.renderTemplateRuleList(templateManagerState.currentTemplateRules, scope);
        }
    },

    handleSaveAllRulesToTemplate: async function() {
        const templateId = templateManagerState.editingTemplateId;
        if (!templateId) {
            uiManager.showStatus("No template selected for saving rules.", "error");
            return;
        }
        uiManager.showStatus(`Saving all rules for template ID ${templateId}...`, "info", 0);
        try {
            // We only need to send the rules array. The backend PUT /api/guarantee-templates/:templateId
            // can accept { rules: [...] } to update just the rules.
            await apiService.updateGuaranteeTemplate(templateId, { rules: templateManagerState.currentTemplateRules });
            uiManager.showStatus("All rules saved successfully to the template.", "success");
            // Optionally, reload the template details to confirm
            const templateDetails = await apiService.fetchGuaranteeTemplateDetails(templateId);
            templateManagerState.currentTemplateRules = templateDetails.rules ? JSON.parse(JSON.stringify(templateDetails.rules)) : [];
            this.renderTemplateRuleList(templateManagerState.currentTemplateRules, templateManagerState.currentTemplateScopeForRules);

        } catch (error) {
            console.error("Error saving all rules to template:", error);
            uiManager.showStatus(`Error saving rules: ${error.message}`, "error");
        }
    },

    closeRulesEditor: function() {
        templateRulesManagementSection.classList.add('hidden');
        templateManagerState.editingTemplateId = null;
        templateManagerState.currentTemplateRules = [];
        templateRulesManagementSection.dataset.editingTemplateId = '';
        this.loadAndDisplayTemplates(); // Refresh main template list view
    }
};