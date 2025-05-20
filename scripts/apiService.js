// scripts/apiService.js

const apiService = {
    API_BASE_URL: 'http://localhost:3000/api',

    handleApiResponse: async function(response, expectingDataInSuccess = true) {
        const responseText = await response.text();
        let resultJson = null;

        if (responseText) {
            try {
                resultJson = JSON.parse(responseText);
            } catch (e) {
                console.error("Failed to parse JSON response. Text:", responseText, "Error:", e);
                if (!response.ok) {
                    throw new Error(`HTTP error ${response.status}: ${response.statusText} - Server returned non-JSON error and response text was: ${responseText}`);
                }
                resultJson = { error: "Server returned OK status but with invalid JSON content.", nonJsonText: responseText };
            }
        } else {
            if (!response.ok) {
                 throw new Error(`HTTP error ${response.status}: ${response.statusText} - Empty response from server.`);
            }
            if (!expectingDataInSuccess) {
                return { message: "success", data: null };
            }
            resultJson = { message: "success", data: null, note: "Empty response body but OK status." };
        }

        if (!response.ok) {
            throw new Error(resultJson?.error || `HTTP error ${response.status}: ${response.statusText}`);
        }

        if (resultJson && resultJson.message === "success") {
            if (!expectingDataInSuccess) {
                return resultJson;
            }
            return resultJson.data;
        }

        if (resultJson && resultJson.nonJsonText) {
             console.warn(`API response OK but content was not JSON. URL: ${response.url}. Content: ${resultJson.nonJsonText}`);
             return { message: "success_non_json", data: resultJson.nonJsonText };
        }
        if (expectingDataInSuccess && (!resultJson || resultJson.message !== "success" || resultJson.data === undefined)) {
             console.warn(`API response OK but missing expected 'data' field or 'message:success'. URL: ${response.url}`, resultJson);
        }
        return resultJson || { message: "success_empty_or_unknown", data: null };
    },

    // --- TCG API Functions ---
    fetchTcgs: async function() {
        const response = await fetch(`${this.API_BASE_URL}/tcgs`);
        return this.handleApiResponse(response);
    },

    addTcg: async function(tcgData) {
        const response = await fetch(`${this.API_BASE_URL}/tcgs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tcgData)
        });
        return this.handleApiResponse(response);
    },

    updateTcg: async function(tcgId, tcgData) {
        const url = `${this.API_BASE_URL}/tcgs/${tcgId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tcgData)
        });
        return this.handleApiResponse(response);
    },

    // --- Set API Functions ---
    fetchSetsForTcg: async function(tcgId) {
        const response = await fetch(`${this.API_BASE_URL}/tcgs/${tcgId}/sets`);
        const fullResult = await response.json();
        if (!response.ok) {
             throw new Error(fullResult.error || `HTTP error ${response.status}: ${response.statusText}`);
        }
        if (fullResult.message === "success" && fullResult.data !== undefined) return fullResult.data;
        throw new Error(fullResult.error || "Failed to fetch sets, unexpected response structure.");
    },

    addSet: async function(tcgId, setData) {
        const response = await fetch(`${this.API_BASE_URL}/tcgs/${tcgId}/sets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(setData)
        });
        return this.handleApiResponse(response);
    },

    updateSet: async function(setId, setData) {
        const url = `${this.API_BASE_URL}/sets/${setId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(setData)
        });
        return this.handleApiResponse(response);
    },

    // --- Rarity API Functions ---
    fetchRaritiesForSet: async function(setId) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/rarities`);
        const fullResult = await response.json();
        if (!response.ok) {
             throw new Error(fullResult.error || `HTTP error ${response.status}: ${response.statusText}`);
        }
        if (fullResult.message === "success" && fullResult.data !== undefined) return fullResult.data;
        throw new Error(fullResult.error || "Failed to fetch rarities, unexpected response structure.");
    },

    addRarity: async function(setId, rarityData) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/rarities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rarityData)
        });
        return this.handleApiResponse(response);
    },

    updateRarity: async function(setId, rarityId, rarityData) {
        const url = `${this.API_BASE_URL}/sets/${setId}/rarities/${rarityId}`; // Corrected URL
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rarityData)
        });
        return this.handleApiResponse(response);
    },

    deleteRarity: async function(setId, rarityId) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/rarities/${rarityId}`, {
            method: 'DELETE'
        });
        return this.handleApiResponse(response, false);
    },

    // --- Product API Functions ---
    fetchProductsForSet: async function(setId) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/products`);
        const fullResult = await response.json();
        if (!response.ok) {
             throw new Error(fullResult.error || `HTTP error ${response.status}: ${response.statusText}`);
        }
        if (fullResult.message === "success" && fullResult.data !== undefined) return fullResult.data;
        throw new Error(fullResult.error || "Failed to fetch products, unexpected response structure.");
    },

    addProduct: async function(setId, productData) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/products`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        return this.handleApiResponse(response);
    },

    updateProduct: async function(productId, productData) {
        const response = await fetch(`${this.API_BASE_URL}/products/${productId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        return this.handleApiResponse(response);
    },

    deleteProduct: async function(productId) {
        const response = await fetch(`${this.API_BASE_URL}/products/${productId}`, {
            method: 'DELETE'
        });
        return this.handleApiResponse(response, false);
    },

    // --- Card API Functions ---
    fetchCardsForSet: async function(setId) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/cards`);
        const fullResult = await response.json();
        if (!response.ok) {
             throw new Error(fullResult.error || `HTTP error ${response.status}: ${response.statusText}`);
        }
        if (fullResult.message === "success" && fullResult.data !== undefined) return fullResult.data;
        throw new Error(fullResult.error || "Failed to fetch cards, unexpected response structure.");
    },

    addCard: async function(setId, cardData) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/cards`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardData)
        });
        return this.handleApiResponse(response);
    },

    updateCard: async function(setId, cardId, cardData) {
        const url = `${this.API_BASE_URL}/sets/${setId}/cards/${cardId}`; // Corrected URL
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cardData)
        });
        return this.handleApiResponse(response);
    },

    deleteCard: async function(setId, cardId) {
        const response = await fetch(`${this.API_BASE_URL}/sets/${setId}/cards/${cardId}`, {
            method: 'DELETE'
        });
        return this.handleApiResponse(response, false);
    },

    // --- Guarantee Template API Functions ---
    fetchGuaranteeTemplates: async function(scope) {
        let url = `${this.API_BASE_URL}/guarantee-templates`;
        if (scope) {
            url += `?scope=${scope}`;
        }
        const response = await fetch(url);
        return this.handleApiResponse(response);
    },

    fetchGuaranteeTemplateDetails: async function(templateId) {
        const url = `${this.API_BASE_URL}/guarantee-templates/${templateId}`;
        const response = await fetch(url);
        return this.handleApiResponse(response);
    },

    createGuaranteeTemplate: async function(templateData) {
        const url = `${this.API_BASE_URL}/guarantee-templates`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
        });
        return this.handleApiResponse(response);
    },

    updateGuaranteeTemplate: async function(templateId, templateUpdateData) {
        const url = `${this.API_BASE_URL}/guarantee-templates/${templateId}`;
        const response = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateUpdateData)
        });
        return this.handleApiResponse(response);
    },

    deleteGuaranteeTemplate: async function(templateId) {
        const url = `${this.API_BASE_URL}/guarantee-templates/${templateId}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });
        return this.handleApiResponse(response, false);
    },

    // --- Card Importer API Function ---
    importCardsCsv: async function(setId, file) {
        const formData = new FormData();
        formData.append('cardCsvFile', file); // 'cardCsvFile' must match multer field name in backend

        const url = `${this.API_BASE_URL}/sets/${setId}/cards/import-csv`;
        // console.log("Attempting to POST CSV to (Import Cards):", url); // Keep for debugging if needed

        const response = await fetch(url, {
            method: 'POST',
            body: formData // 'Content-Type' header is set automatically by browser for FormData
        });
        // This response will be JSON with import summary, so handleApiResponse should work.
        return this.handleApiResponse(response);
    }
};