// content.js - The Scraper
// Implements MutationObserver to detect chat window changes
// and extracts draft and context for analysis
// Version: 2.0 - Enhanced with emoji popup and emotion detection

(function () {
  console.log("Second Thought Content Script Loaded");

  // Configuration
  const CONFIG = {
    WHATSAPP: {
      DRAFT_SELECTOR: '[contenteditable="true"]',
      MESSAGE_SELECTOR: '[data-pre-plain-text]',
      CONTEXT_LIMIT: 10
    },
    DISCORD: {
      DRAFT_SELECTOR: '[role="textbox"]',
      MESSAGE_SELECTOR: '[class*="messageContent"]',
      CONTEXT_LIMIT: 10
    },
    DEBOUNCE_TIME: 1000 // ms
  };

  // State management
  let currentDraft = "";
  let debounceTimer = null;
  let popupElement = null;
  let modalElement = null;
  let currentAnalysis = null;
  let popupHideTimeout = null;

  // Detect platform
  function detectPlatform() {
    if (window.location.hostname.includes("whatsapp")) {
      return "WHATSAPP";
    } else if (window.location.hostname.includes("discord")) {
      return "DISCORD";
    }
    return null;
  }

  const platform = detectPlatform();
  console.log(`Second Thought: Platform detected - ${platform || "unsupported"}`);

  // Get configuration for current platform
  function getConfig() {
    return CONFIG[platform];
  }

  // Check if message is trivial
  function isTrivialMessage(draft) {
    if (!draft || draft.trim().length === 0) return true;

    const trimmed = draft.trim().toLowerCase();

    // Very short messages (less than 3 words)
    const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount < 3 && trimmed.length < 15) {
      // Check if it's a common trivial phrase
      const trivialPatterns = [
        /^(ok|k|kk|okay|yep|yeah|yes|no|nope|thanks|ty|thx|np|brb|be right back|ttyl|talk to you later|gtg|got to go|cya|see ya|hi|hey|hello|bye|goodbye|good night|gn|good morning|gm)$/i,
        /^(lol|haha|hehe|lmao|rofl)$/i,
        /^[👍👋👌✅❌💯🔥💪🙂😊😀😁😂🤣😃😄😅😆😉😎😍🥰😘😗😙😚☺️🙃😋😛😝😜🤪🤨🧐🤓😏😒😞😔😟😕🙁☹️😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾]+$/,
      ];

      if (trivialPatterns.some(pattern => pattern.test(trimmed))) {
        return true;
      }
    }

    // Single emoji or very short
    if (trimmed.length <= 2 && /^[\p{Emoji}]+$/u.test(trimmed)) {
      return true;
    }

    return false;
  }

  // Extract messages for context
  function extractMessages() {
    const config = getConfig();
    const messageElements = Array.from(document.querySelectorAll(config.MESSAGE_SELECTOR));

    // Get last N messages
    const recentMessages = messageElements
      .slice(-config.CONTEXT_LIMIT)
      .map(el => {
        const text = el.textContent?.trim() || "";
        if (!text) return null;

        // For WhatsApp, try to determine sender
        if (platform === "WHATSAPP") {
          // Check for specific message direction classes
          const messageRow = el.closest('.message-in, .message-out');
          if (messageRow) {
            const isMe = messageRow.classList.contains('message-out');
            const senderTag = isMe ? "[Me]" : "[Them]";
            return `${senderTag}: ${text}`;
          }

          // Fallback: try to get sender info from data attribute
          const metadata = el.getAttribute("data-pre-plain-text");
          if (metadata) {
            // metadata format is usually "[Time, Date] Name: "
            return `${metadata} ${text}`;
          }
        }

        // For Discord, try to determine sender
        if (platform === "DISCORD") {
          const messageRow = el.closest('[class*="message-"]');
          if (messageRow) {
            // Find the author display name
            let authorEl = messageRow.querySelector('[class*="username-"]');

            // If no author element (grouped message), look up previous siblings
            if (!authorEl) {
              let prev = messageRow.previousElementSibling;
              let depth = 0;
              while (prev && !authorEl && depth < 20) { // Safety limit
                authorEl = prev.querySelector('[class*="username-"]');
                prev = prev.previousElementSibling;
                depth++;
              }
            }

            if (authorEl) {
              const authorName = authorEl.textContent.trim();

              // Get current user's name from account panel (bottom left)
              // This is a common selector but can vary; we check multiple
              const meEl = document.querySelector('[class*="nameTag-"] [class*="username-"]') ||
                document.querySelector('[class*="accountProfileCard-"] [class*="username-"]') ||
                document.querySelector('[class*="panel-"] [class*="text-"]');

              const meName = meEl?.textContent.trim();

              // If we can't find 'Me', we just use the name but this is the goal
              const isMe = (meName && authorName === meName);
              const senderTag = isMe ? "[Me]" : "[Them]";

              return `${senderTag} (${authorName}): ${text}`;
            }
          }
        }

        return text;
      })
      .filter(msg => msg !== null);

    return recentMessages;
  }

  // Extract current draft text
  function extractDraft() {
    let draftElement = null;

    if (platform === "WHATSAPP") {
      draftElement = findWhatsAppInput();
    } else {
      const config = getConfig();
      draftElement = document.querySelector(config.DRAFT_SELECTOR);
    }

    if (!draftElement) {
      return "";
    }

    // Handle contenteditable elements
    if (draftElement.contentEditable === "true") {
      const text = draftElement.textContent?.trim() || draftElement.innerText?.trim() || "";
      return text;
    }

    // Handle input/textarea elements
    if (draftElement.value !== undefined) {
      return draftElement.value.trim();
    }

    return "";
  }

  // Get draft element position for popup placement
  function getDraftElementPosition() {
    const config = getConfig();
    const draftElement = document.querySelector(config.DRAFT_SELECTOR);

    if (!draftElement) {
      return null;
    }

    const rect = draftElement.getBoundingClientRect();
    return {
      top: rect.top + window.scrollY,
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      bottom: rect.bottom + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  }

  // Create emoji popup element
  function createPopup() {
    if (popupElement && document.body.contains(popupElement)) {
      return popupElement;
    }

    // Remove old popup if it exists but isn't in DOM
    if (popupElement) {
      popupElement.remove();
    }

    const popup = document.createElement("div");
    popup.className = "second-thought-popup hidden";
    popup.innerHTML = `
      <span class="second-thought-emoji">😐</span>
      <span class="second-thought-label">Analyzing...</span>
      <div class="second-thought-menu-dots">
        <span></span><span></span><span></span>
      </div>
    `;

    // Ensure popup is visible (layout handled by CSS now)
    popup.style.display = "flex";

    popup.addEventListener("click", () => {
      // Clear auto-hide timeout when clicked
      if (popupHideTimeout) {
        clearTimeout(popupHideTimeout);
        popupHideTimeout = null;
      }
      showDetailedModal();
    });

    document.body.appendChild(popup);
    popupElement = popup;
    console.log("Second Thought: Popup element created and added to DOM");
    return popup;
  }

  // Create modal element
  function createModal() {
    if (modalElement) {
      return modalElement;
    }

    const overlay = document.createElement("div");
    overlay.className = "second-thought-modal-overlay hidden";
    overlay.innerHTML = `
      <div class="second-thought-modal">
        <div class="second-thought-modal-header">
          <div class="second-thought-modal-title">
            <span class="second-thought-modal-emoji">😐</span>
            <span>Message Analysis</span>
          </div>
          <button class="second-thought-modal-close" aria-label="Close">×</button>
        </div>
        <div class="second-thought-modal-body">
          <div class="second-thought-modal-section">
            <div class="second-thought-modal-section-title">Emotion</div>
            <div class="second-thought-modal-section-content">
              <span class="second-thought-modal-emotion">
                <span class="second-thought-modal-emoji">😐</span>
                <span id="modal-emotion-text">Neutral</span>
              </span>
            </div>
          </div>
          <div class="second-thought-modal-section">
            <div class="second-thought-modal-section-title">Tone</div>
            <div class="second-thought-modal-section-content">
              <span class="second-thought-modal-tone" id="modal-tone">Neutral</span>
            </div>
          </div>
          <div class="second-thought-modal-section">
            <div class="second-thought-modal-section-title">How They'll Feel</div>
            <div class="second-thought-modal-section-content" id="modal-feeling">Neutral</div>
          </div>
          <div class="second-thought-modal-section">
            <div class="second-thought-modal-section-title">Perception Analysis</div>
            <div class="second-thought-modal-section-content" id="modal-perception">Analyzing...</div>
          </div>
          <div class="second-thought-modal-section">
            <div class="second-thought-modal-section-title">Your Message</div>
            <div class="second-thought-message-box" id="modal-draft">No message</div>
          </div>
          <div class="second-thought-modal-section" id="modal-improved-section" style="display: none;">
            <div class="second-thought-modal-section-title">Suggestion</div>
            <div class="second-thought-suggestion-box" id="modal-improved">No suggestion</div>
          </div>
        </div>
      </div>
    `;

    // Close handlers
    const closeBtn = overlay.querySelector(".second-thought-modal-close");
    closeBtn.addEventListener("click", () => {
      overlay.classList.add("hidden");
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.classList.add("hidden");
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
        overlay.classList.add("hidden");
      }
    });

    document.body.appendChild(overlay);
    modalElement = overlay;
    return overlay;
  }

  // Show detailed analysis modal
  function showDetailedModal() {
    if (!currentAnalysis) return;

    const modal = createModal();
    const result = currentAnalysis.result;

    // Update modal content
    const emojiEl = modal.querySelector(".second-thought-modal-emoji");
    const emotionText = modal.querySelector("#modal-emotion-text");
    const toneEl = modal.querySelector("#modal-tone");
    const feelingEl = modal.querySelector("#modal-feeling");
    const perceptionEl = modal.querySelector("#modal-perception");
    const draftEl = modal.querySelector("#modal-draft");
    const improvedEl = modal.querySelector("#modal-improved");
    const improvedSection = modal.querySelector("#modal-improved-section");

    if (emojiEl) emojiEl.textContent = result.emoji || "😐";
    if (emotionText) emotionText.textContent = result.primary_emotion || "neutral";


    if (toneEl) {
      toneEl.textContent = result.tone || "neutral";
      // Add tone class
      toneEl.className = "second-thought-modal-tone";
      const lowerTone = (result.tone || "").toLowerCase();
      if (lowerTone.includes("positive") || lowerTone.includes("friendly") || lowerTone.includes("kind")) {
        toneEl.classList.add("positive");
      } else if (lowerTone.includes("negative") || lowerTone.includes("harsh") || lowerTone.includes("aggressive")) {
        toneEl.classList.add("negative");
      } else {
        toneEl.classList.add("neutral");
      }
    }
    if (feelingEl) feelingEl.textContent = result.recipient_feeling || "neutral";
    if (perceptionEl) perceptionEl.textContent = result.perception_analysis || "Unable to analyze.";
    if (draftEl) draftEl.textContent = currentAnalysis.originalDraft || "No message";

    // Show improved draft if different
    if (improvedEl && result.improved_draft && result.improved_draft !== currentAnalysis.originalDraft) {
      improvedEl.textContent = result.improved_draft;
      if (improvedSection) improvedSection.style.display = "block";
    } else {
      if (improvedSection) improvedSection.style.display = "none";
    }

    modal.classList.remove("hidden");

    // Hide the small popup when detailed modal opens
    hidePopup();
  }

  // Play ding sound and show ambient glow
  function playDingSound() {
    try {
      console.log("Second Thought: Attempting to play ding sound");
      // Create a simple ding sound using Web Audio API
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor();

      // Ensure context is running (needed for some browsers policy)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Trigger ambient glow
      showAmbientGlow();
    } catch (error) {
      console.log("Second Thought: Could not play sound", error);
    }
  }

  // Show ambient glow animation
  function showAmbientGlow() {
    // Remove existing glow if any
    const existingGlow = document.querySelector('.second-thought-ambient-glow');
    if (existingGlow) {
      existingGlow.remove();
    }

    const glow = document.createElement('div');
    glow.className = 'second-thought-ambient-glow';
    document.body.appendChild(glow);

    // Remove after animation completes
    setTimeout(() => {
      if (document.body.contains(glow)) {
        glow.remove();
      }
    }, 2500);
  }

  // Position and show popup
  function showPopup(emoji, label, autoHide = true) {
    console.log("Second Thought: showPopup called with", emoji, label, "autoHide:", autoHide);
    const popup = createPopup();
    // CSS handles positioning now (fixed top center)
    // We just need to update content and visibility

    console.log("Second Thought: Updating popup content", { emoji, label });

    // Update content
    const emojiEl = popup.querySelector(".second-thought-emoji");
    const labelEl = popup.querySelector(".second-thought-label");

    if (emojiEl) {
      emojiEl.textContent = emoji || "😐";
      // Force repaint
      emojiEl.style.display = 'none';
      emojiEl.offsetHeight; // trigger reflow
      emojiEl.style.display = '';
    }

    if (labelEl) labelEl.textContent = label || "Analyzing...";

    // Force visibility
    popup.style.display = "flex";
    popup.classList.remove("hidden");

    // Force visibility with inline styles
    popup.style.zIndex = "999999";
    popup.style.display = "flex";
    popup.style.visibility = "visible";
    popup.style.opacity = "1";
    popup.style.pointerEvents = "auto";
    popup.classList.remove("hidden");

    // Clear any existing timeout
    if (popupHideTimeout) {
      clearTimeout(popupHideTimeout);
      popupHideTimeout = null;
    }

    // Auto-hide only if requested (default for results)
    if (autoHide) {
      popupHideTimeout = setTimeout(() => {
        console.log("Second Thought: Auto-hiding popup after 8s");
        hidePopup();
      }, 8000);
    }
  }

  // Hide popup
  function hidePopup() {
    if (popupElement) {
      popupElement.classList.add("hidden");
    }
  }

  // Check if draft has changed significantly
  function hasDraftChanged(newDraft) {
    if (!newDraft && !currentDraft) return false;
    if (!newDraft || !currentDraft) return true;

    // Simple change detection - could be enhanced with more sophisticated diffing
    return newDraft !== currentDraft;
  }

  // Send draft for analysis
  function sendForAnalysis(draft, context) {
    if (!draft || draft.length === 0) {
      console.log("Second Thought: No draft to analyze");
      hidePopup();
      return;
    }

    // Filter trivial messages
    if (isTrivialMessage(draft)) {
      console.log("Second Thought: Trivial message detected, skipping analysis:", draft);
      hidePopup();
      return;
    }

    console.log("Second Thought: Sending draft for analysis", { draft: draft.substring(0, 50), contextLength: context.length });

    // Show loading popup immediately - DON'T auto-hide while waiting
    showPopup("⏳", "Analyzing...", false);

    // Set a timeout to hide popup if no response
    const timeoutId = setTimeout(() => {
      console.error("Second Thought: Analysis timeout - no response after 15 seconds");
      showPopup("❌", "Timeout");
      setTimeout(() => {
        hidePopup();
      }, 2000);
    }, 15000);

    chrome.runtime.sendMessage({
      action: "ANALYZE_DRAFT",
      payload: {
        draft: draft,
        context: context,
        platform: platform
      }
    }, (response) => {
      clearTimeout(timeoutId);

      if (chrome.runtime.lastError) {
        console.error("Second Thought: Runtime error", chrome.runtime.lastError);
        showPopup("❌", "Error");
        setTimeout(() => {
          hidePopup();
        }, 2000);
      } else {
        console.log("Second Thought: Analysis response received", response);
        if (response) {
          handleAnalysisResponse(response);
        } else {
          console.error("Second Thought: No response received");
          showPopup("❌", "No Response");
          setTimeout(() => {
            hidePopup();
          }, 2000);
        }
      }
    });
  }

  // Handle analysis response
  function handleAnalysisResponse(response) {
    if (!response || response.type === "ERROR") {
      console.error("Second Thought: Analysis error");
      console.error("Second Thought: Error type:", response?.errorType);
      console.error("Second Thought: Error message:", response?.message);

      // Show user-friendly error message
      let errorMsg = "Analysis failed";
      let emoji = "❌";

      if (response?.status === 429) {
        errorMsg = "Quota exceeded - check API settings";
        emoji = "⏸️";
      } else if (response?.status === 404) {
        errorMsg = "Model not found";
        emoji = "⚠️";
      } else if (response?.message) {
        // Show first part of error message
        errorMsg = response.message.substring(0, 30);
      }

      showPopup(emoji, errorMsg);
      setTimeout(() => {
        hidePopup();
      }, 4000);
      return;
    }

    if (response.type === "ANALYSIS_RESULT") {
      currentAnalysis = response;
      const result = response.result;

      // Show popup with emoji
      const emoji = result.emoji || "😐";
      const emotion = result.primary_emotion || "neutral";
      showPopup(emoji, emotion);

      // Play sound if significant emotion detected (delayed to allow visual update)
      if (result.has_significant_emotion) {
        setTimeout(() => {
          playDingSound();
        }, 600);
      }
    }
  }

  // Debounced analysis function
  function debouncedAnalysis() {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      const newDraft = extractDraft();

      if (hasDraftChanged(newDraft)) {
        currentDraft = newDraft;

        // Hide popup if draft is empty
        if (!newDraft || newDraft.length === 0) {
          console.log("Second Thought: Draft empty, hiding popup");
          hidePopup();
          currentAnalysis = null;
          // Ensure we don't think we're still processing
          return;
        }

        const context = extractMessages();
        sendForAnalysis(newDraft, context);
      }
    }, CONFIG.DEBOUNCE_TIME);
  }

  // Find WhatsApp input element with multiple strategies
  function findWhatsAppInput() {
    // Try multiple selectors for WhatsApp
    const selectors = [
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
      'div[contenteditable="true"]',
      'div[contenteditable="true"].selectable-text',
      'p.selectable-text[contenteditable="true"]',
      '[contenteditable="true"]'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        // Check if it's likely the input box (has certain attributes or is in the right location)
        const rect = el.getBoundingClientRect();
        // Input box is usually at the bottom of the screen
        if (rect.bottom > window.innerHeight * 0.7 || el.closest('[data-testid="conversation-compose-box"]')) {
          return el;
        }
      }
    }

    // Fallback: return first contenteditable that's focused
    const allContentEditable = document.querySelectorAll('[contenteditable="true"]');
    for (const el of allContentEditable) {
      if (document.activeElement === el || el === document.activeElement?.closest('[contenteditable="true"]')) {
        return el;
      }
    }

    return null;
  }

  // Set up MutationObserver
  function setupObserver() {
    const config = { childList: true, subtree: true, characterData: true };

    let draftElement = null;
    let inputHandlerAttached = false;

    const attachInputHandlers = (element) => {
      if (!element || inputHandlerAttached) return;

      console.log("Second Thought: Attaching input handlers to element");

      const handler = () => {
        const draftText = extractDraft();
        if (draftText && draftText.length > 0) {
          debouncedAnalysis();
        }
      };

      element.addEventListener("input", handler, true);
      element.addEventListener("keyup", handler, true);
      element.addEventListener("paste", handler, true);

      // Also watch for focus
      element.addEventListener("focus", () => {
        console.log("Second Thought: Input element focused");
        draftElement = element;
      }, true);

      inputHandlerAttached = true;
      draftElement = element;
    };

    // Throttled MutationObserver
    let observerTimeout = null;
    const observer = new MutationObserver((mutations) => {
      if (observerTimeout) return;

      observerTimeout = setTimeout(() => {
        observerTimeout = null;

        // Only search if we don't have a valid draft element
        // Check if we lost the element
        if (draftElement && !document.body.contains(draftElement)) {
          console.log("Second Thought: Lost draft element (chat switch?), resetting...");
          draftElement = null;
          inputHandlerAttached = false;
        }

        // Only search if we don't have a valid draft element
        if (!draftElement) {
          if (platform === "WHATSAPP") {
            draftElement = findWhatsAppInput();
          } else {
            draftElement = document.querySelector(getConfig().DRAFT_SELECTOR);
          }

          if (draftElement && !inputHandlerAttached) {
            console.log("Second Thought: Found new draft element");
            attachInputHandlers(draftElement);
            // Reset current draft ensures we re-analyze if needed
            currentDraft = "";
          }
        }
      }, 500); // Check at most every 500ms
    });

    observer.observe(document.body, config);
    console.log("Second Thought: MutationObserver set up (Optimized)");

    // Try to find input element immediately and periodically
    const findAndAttach = () => {
      if (platform === "WHATSAPP") {
        draftElement = findWhatsAppInput();
      } else {
        draftElement = document.querySelector(getConfig().DRAFT_SELECTOR);
      }

      if (draftElement) {
        console.log("Second Thought: Found draft element:", draftElement);
        attachInputHandlers(draftElement);
      } else {
        console.log("Second Thought: Draft element not found yet, will retry...");
        setTimeout(findAndAttach, 1000);
      }
    };

    // Start looking for the input element
    setTimeout(findAndAttach, 500);
    setTimeout(findAndAttach, 2000);
    setTimeout(findAndAttach, 5000);
  }

  // Test function - can be called from console
  window.testSecondThought = function () {
    console.log("Second Thought: Test function called");
    const draft = extractDraft();
    console.log("Current draft:", draft);
    showPopup("😊", "Test Popup");
    setTimeout(() => {
      hidePopup();
    }, 3000);
  };

  // Initialize
  function init() {
    console.log("Second Thought: Initializing content script");

    // Only set up observers if platform is supported
    if (platform) {
      // Create popup and modal elements
      createPopup();
      createModal();

      // Test popup visibility
      setTimeout(() => {
        const testPopup = document.querySelector(".second-thought-popup");
        if (testPopup) {
          console.log("Second Thought: Popup element exists in DOM");
          console.log("Second Thought: Popup styles:", window.getComputedStyle(testPopup).display);
        } else {
          console.error("Second Thought: Popup element NOT found in DOM!");
        }
      }, 1000);

      // Wait for page to be interactive
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          setupObserver();
        });
      } else {
        setupObserver();
      }
    }
  }

  // Start the content script
  init();

})(); // Close the IIFE
