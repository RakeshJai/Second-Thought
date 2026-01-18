// sidepanel.js - Modern UI Controller

console.log("Echo Side Panel Loaded");

// DOM Elements - initialized in init
let ELEMENTS = {};

// Initialize the side panel
function init() {
  console.log("Echo: Initializing side panel");

  ELEMENTS = {
    apiKeyInput: document.getElementById("apiKey"),
    saveApiKeyBtn: document.getElementById("saveApiKey"),
    apiKeyStatus: document.getElementById("apiKeyStatus"),
    errorSection: document.getElementById("errorSection"),
    errorMessage: document.getElementById("errorMessage"),
    modelSelect: document.getElementById("modelSelect")
  };

  setupEventListeners();
  loadSettings();
}

// Set up event listeners
function setupEventListeners() {
  if (!ELEMENTS.saveApiKeyBtn) return;

  // Save Settings button
  ELEMENTS.saveApiKeyBtn.addEventListener("click", saveSettings);

  // API Key input - show as text when focused
  ELEMENTS.apiKeyInput.addEventListener("focus", function () {
    this.type = "text";
  });

  ELEMENTS.apiKeyInput.addEventListener("blur", function () {
    this.type = "password";
  });

  // Enter key to save
  ELEMENTS.apiKeyInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      saveSettings();
    }
  });
}

// Show status message
function showStatus(message, type = "info") {
  if (!ELEMENTS.apiKeyStatus) return;
  ELEMENTS.apiKeyStatus.className = `status-badge ${type}`;
  ELEMENTS.apiKeyStatus.textContent = message;
  ELEMENTS.apiKeyStatus.classList.remove("hidden");
}

// Load saved settings
async function loadSettings() {
  try {
    // UPDATED: Using 'openrouter_api_key' to match background.js
    const result = await chrome.storage.local.get(["openrouter_api_key", "selected_model"]);

    // API Key State
    if (result.openrouter_api_key) {
      console.log("Echo: Found existing API key");
      ELEMENTS.apiKeyInput.placeholder = "Custom Key Active";
      showStatus("Neural config synchronized.", "success");
    } else {
      showStatus("Using standard model access.", "info");
    }

    // Model Selection State
    if (result.selected_model && ELEMENTS.modelSelect) {
      ELEMENTS.modelSelect.value = result.selected_model;
    }
  } catch (error) {
    console.error("Echo: Error loading settings", error);
  }
}

// Save all settings
async function saveSettings() {
  const apiKey = ELEMENTS.apiKeyInput.value.trim();
  const selectedModel = ELEMENTS.modelSelect ? ELEMENTS.modelSelect.value : "mistralai/devstral-2512:free";

  ELEMENTS.saveApiKeyBtn.disabled = true;
  const originalHtml = ELEMENTS.saveApiKeyBtn.innerHTML;
  ELEMENTS.saveApiKeyBtn.innerHTML = '<span>⏳</span><span>Synchronizing...</span>';

  try {
    // 1. Save API Key via background script if entered
    if (apiKey) {
      await chrome.runtime.sendMessage({
        action: "API_KEY_SAVED",
        payload: { apiKey }
      });
      ELEMENTS.apiKeyInput.value = "";
      ELEMENTS.apiKeyInput.placeholder = "Custom Key Active";
    }

    // 2. Save Model Selection directly
    await chrome.storage.local.set({ "selected_model": selectedModel });

    showStatus("✅ Neural network configured!", "success");
    hideError();

  } catch (error) {
    console.error("Echo: Error saving settings", error);
    showError(`Sync Failed: ${error.message}`);
  } finally {
    ELEMENTS.saveApiKeyBtn.disabled = false;
    ELEMENTS.saveApiKeyBtn.innerHTML = '<span>💾</span><span>Apply Changes</span>';
  }
}

// Show error message
function showError(message) {
  if (!ELEMENTS.errorSection) return;
  ELEMENTS.errorSection.classList.remove("hidden");
  ELEMENTS.errorMessage.textContent = message;
}

// Hide error message
function hideError() {
  if (ELEMENTS.errorSection) {
    ELEMENTS.errorSection.classList.add("hidden");
  }
}

// Initialize the side panel when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
