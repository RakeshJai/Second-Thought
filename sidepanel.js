// sidepanel.js - Modern UI Controller
// Handles user interaction and displays settings

console.log("Second Thought Side Panel Loaded");

// DOM Elements
const ELEMENTS = {
  apiKeyInput: document.getElementById("apiKey"),
  saveApiKeyBtn: document.getElementById("saveApiKey"),
  apiKeyStatus: document.getElementById("apiKeyStatus"),
  errorSection: document.getElementById("errorSection"),
  errorMessage: document.getElementById("errorMessage")
};

// Initialize the side panel
function init() {
  console.log("Second Thought: Initializing side panel");

  setupEventListeners();
  loadSettings();
}

// Set up event listeners
function setupEventListeners() {
  // Save Settings button
  ELEMENTS.saveApiKeyBtn.addEventListener("click", saveSettings);

  // API Key input - allow showing/hiding
  ELEMENTS.apiKeyInput.addEventListener("focus", function () {
    this.type = "text";
  });

  ELEMENTS.apiKeyInput.addEventListener("blur", function () {
    if (this.value === "") {
      this.type = "password";
    }
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
  ELEMENTS.apiKeyStatus.className = `status-badge ${type}`;
  ELEMENTS.apiKeyStatus.textContent = message;
  ELEMENTS.apiKeyStatus.classList.remove("hidden");
}

// Load saved settings
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(["gemini_api_key", "selected_model"]);

    // API Key State
    if (result.gemini_api_key) {
      console.log("Second Thought: Found existing API key");
      ELEMENTS.apiKeyInput.placeholder = "Custom Key Active";
      showStatus("Neural config synchronized.", "success");
    } else {
      showStatus("Using standard model access.", "info");
    }

    // Model Selection State
    if (result.selected_model) {
      const modelSelect = document.getElementById("modelSelect");
      if (modelSelect) {
        modelSelect.value = result.selected_model;
      }
    }
  } catch (error) {
    console.error("Second Thought: Error loading settings", error);
  }
}

// Save all settings
async function saveSettings() {
  const apiKey = ELEMENTS.apiKeyInput.value.trim();
  const modelSelect = document.getElementById("modelSelect");
  const selectedModel = modelSelect ? modelSelect.value : "mistralai/devstral-2512:free";

  ELEMENTS.saveApiKeyBtn.disabled = true;
  ELEMENTS.saveApiKeyBtn.innerHTML = '<span>⏳</span><span>Synchronizing...</span>';

  try {
    // 1. Save API Key if entered
    if (apiKey) {
      await chrome.runtime.sendMessage({
        action: "API_KEY_SAVED",
        payload: { apiKey }
      });
      ELEMENTS.apiKeyInput.value = "";
      ELEMENTS.apiKeyInput.placeholder = "Custom API key is set";
    }

    // 2. Save Model Selection
    await chrome.storage.local.set({ "selected_model": selectedModel });

    showStatus("✅ Neural network configured!", "success");
    hideError();

  } catch (error) {
    console.error("Second Thought: Error saving settings", error);
    showError(`Sync Failed: ${error.message}`);
  } finally {
    ELEMENTS.saveApiKeyBtn.disabled = false;
    ELEMENTS.saveApiKeyBtn.innerHTML = '<span>💾</span><span>Apply Changes</span>';
  }
}

// Show error message
function showError(message) {
  console.error("Second Thought: Error -", message);
  ELEMENTS.errorSection.classList.remove("hidden");
  ELEMENTS.errorMessage.textContent = message;
}

// Hide error message
function hideError() {
  ELEMENTS.errorSection.classList.add("hidden");
}

// Initialize the side panel when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
