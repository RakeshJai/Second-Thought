// content.js - The Scraper
// Implements MutationObserver to detect chat window changes
// and extracts draft and context for analysis
// Version: 2.0 - Enhanced with emoji popup and emotion detection

(function () {
  console.log("Echo Content Script Loaded");

  // Configuration
  const CONFIG = {
    WHATSAPP: {
      DRAFT_SELECTOR: '[contenteditable="true"]',
      MESSAGE_SELECTOR: '[data-pre-plain-text]',
      CONTEXT_LIMIT: 10
    },
    DISCORD: {
      DRAFT_SELECTOR: '[role="textbox"][contenteditable="true"], [data-slate-editor="true"], [class*="textArea-"] [role="textbox"], [aria-label^="Message"]',
      MESSAGE_SELECTOR: '[class*="messageContent-"], [id^="message-content-"], li[class*="message-"] [class*="markup-"], [class*="textContainer-"]',
      CONTEXT_LIMIT: 12
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
  console.log(`Echo: Platform detected - ${platform || "unsupported"}`);

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
          const messageRow = el.closest('[class*="message-"], [class*="messageListItem-"]');
          if (messageRow) {
            // Find the author element
            // Discord uses [class*="username-"] for the actual name
            let authorEl = messageRow.querySelector('[class*="username-"], [class*="author-"]');

            // If no author element (grouped message), look up previous siblings
            if (!authorEl) {
              let prev = messageRow.previousElementSibling;
              let depth = 0;
              while (prev && !authorEl && depth < 40) { // Increased depth for busy chats
                authorEl = prev.querySelector('[class*="username-"], [class*="author-"]');
                prev = prev.previousElementSibling;
                depth++;
              }
            }

            if (authorEl) {
              const authorName = authorEl.textContent.trim();

              // Get current user's name (Me)
              const meEl = document.querySelector('[class*="nameTag-"] [class*="username-"]') ||
                document.querySelector('[class*="accountProfileCard-"] [class*="username-"]') ||
                document.querySelector('[class*="panel-"] [class*="text-"] div') ||
                document.querySelector('[class*="container-"] [class*="avatar-"] + div [class*="username-"]') ||
                document.querySelector('[class*="userProfileInner-"] [class*="nickname-"]');

              const meName = meEl?.textContent.trim();

              // If we find a match, it's Me
              const isMe = (meName && authorName === meName);
              const senderTag = isMe ? "[Me]" : "[Them]";

              return `${senderTag} (${authorName}): ${text}`;
            } else {
              // Fallback if no author found after searching siblings
              return `[Them]: ${text}`;
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
    } else if (platform === "DISCORD") {
      draftElement = findDiscordInput();
    } else {
      const config = getConfig();
      draftElement = document.querySelector(config.DRAFT_SELECTOR);
    }

    if (!draftElement) {
      return "";
    }

    // Handle contenteditable elements
    if (draftElement.contentEditable === "true" || draftElement.getAttribute('contenteditable') === 'true') {
      // In Slate, sometimes we need to join text of children
      const text = draftElement.innerText || draftElement.textContent || "";
      // Strip any leading/trailing zero-width spaces and other invisible characters often found in chat inputs
      return text.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    }

    // Handle input/textarea elements
    if (draftElement.value !== undefined) {
      return draftElement.value.trim();
    }

    return "";
  }

  // Get draft element position for popup placement
  function getDraftElementPosition() {
    let draftElement = null;
    if (platform === "WHATSAPP") {
      draftElement = findWhatsAppInput();
    } else if (platform === "DISCORD") {
      draftElement = findDiscordInput();
    } else {
      draftElement = document.querySelector(getConfig().DRAFT_SELECTOR);
    }

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

  // Apply suggestion to chat input
  function applySuggestion(text) {
    if (!text) return;

    let inputEl = null;
    if (platform === "WHATSAPP") {
      inputEl = findWhatsAppInput();
    } else if (platform === "DISCORD") {
      inputEl = findDiscordInput();
    }

    if (!inputEl) {
      console.error("Echo: Could not find input element to apply suggestion");
      return;
    }

    try {
      // Focus the input first
      inputEl.focus();

      // Update state BEFORE triggering events to prevent re-analysis
      currentDraft = text;

      // Use execCommand to preserve the editor's internal state (Undo/Redo support)
      // First select all to replace the entire content
      document.execCommand('selectAll', false, null);

      // Then insert the new text (this replaces the selection)
      document.execCommand('insertText', false, text);

      // Dispatch events to ensure the platform knows the content changed
      const events = ['input', 'change'];
      events.forEach(type => {
        const event = new Event(type, { bubbles: true });
        inputEl.dispatchEvent(event);
      });

      console.log("Echo: Suggestion applied to input. State updated to prevent loop.");

      // Close the modal and hide all popups immediately
      if (modalElement) {
        modalElement.classList.add("hidden");
      }
      hidePopup();

      // Show a very brief confirmation that doesn't trigger analysis
      showPopup("✅", "Applied!", true);

      // Ensure currentDraft is perfectly matched to what extractDraft will see
      setTimeout(() => {
        currentDraft = extractDraft();
      }, 100);

    } catch (error) {
      console.error("Echo: Error applying suggestion", error);
      // Fallback: direct manipulation (less reliable for complex editors)
      inputEl.textContent = text;
      inputEl.innerText = text;
    }
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
    popup.className = "echo-popup hidden";
    popup.innerHTML = `
      <span class="echo-emoji">😐</span>
      <span class="echo-label">Analyzing...</span>
      <div class="echo-menu-dots">
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
    console.log("Echo: Popup element created and added to DOM");
    return popup;
  }

  // Create modal element
  function createModal() {
    if (modalElement) {
      return modalElement;
    }

    const overlay = document.createElement("div");
    overlay.className = "echo-modal-overlay hidden";
    overlay.innerHTML = `
      <div class="echo-modal">
        <div class="echo-modal-header">
          <div class="echo-modal-title">
            <span class="echo-modal-emoji">😐</span>
            <span>Message Analysis</span>
          </div>
          <button class="echo-modal-close" aria-label="Close">×</button>
        </div>
        <div class="echo-modal-body">
          <div class="echo-modal-section">
            <div class="echo-modal-section-title">Emotion</div>
            <div class="echo-modal-section-content">
              <span class="echo-modal-emotion">
                <span class="echo-modal-emoji">😐</span>
                <span id="modal-emotion-text">Neutral</span>
              </span>
            </div>
          </div>
          <div class="echo-modal-section">
            <div class="echo-modal-section-title">Tone</div>
            <div class="echo-modal-section-content">
              <span class="echo-modal-tone" id="modal-tone">Neutral</span>
            </div>
          </div>
          <div class="echo-modal-section">
            <div class="echo-modal-section-title">How They'll Feel</div>
            <div class="echo-modal-section-content" id="modal-feeling">Neutral</div>
          </div>
          <div class="echo-modal-section">
            <div class="echo-modal-section-title">Perception Analysis</div>
            <div class="echo-modal-section-content" id="modal-perception">Analyzing...</div>
          </div>
          <div class="echo-modal-section">
            <div class="echo-modal-section-title">Your Message</div>
            <div class="echo-message-box" id="modal-draft">No message</div>
          </div>
          <div class="echo-modal-section" id="modal-improved-section" style="display: none;">
            <div class="echo-modal-section-title">Suggestion (Click to use)</div>
            <div class="echo-suggestion-box" id="modal-improved" title="Click to apply this suggestion to your chat">No suggestion</div>
          </div>
        </div>
      </div>
    `;

    // Click handler for suggestion
    const improvedBox = overlay.querySelector("#modal-improved");
    if (improvedBox) {
      improvedBox.addEventListener("click", () => {
        const text = improvedBox.textContent;
        if (text && text !== "No suggestion") {
          applySuggestion(text);
        }
      });
    }

    // Close handlers
    const closeBtn = overlay.querySelector(".echo-modal-close");
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
    const emojiEl = modal.querySelector(".echo-modal-emoji");
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
      toneEl.className = "echo-modal-tone";
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

  // Play bright, Apple-style notification sound and show ambient glow
  function playDingSound() {
    try {
      console.log("Echo: Attempting to play bright notification sound");
      // Create a bright, uplifting sound using Web Audio API
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextCtor();

      // Ensure context is running
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // Create oscillators for a pleasant chime
      const fundamental = audioContext.createOscillator();
      const harmonic1 = audioContext.createOscillator();
      const harmonic2 = audioContext.createOscillator();

      const gainNode = audioContext.createGain();
      const harmonic1Gain = audioContext.createGain();
      const harmonic2Gain = audioContext.createGain();

      // Connect nodes
      fundamental.connect(gainNode);
      harmonic1.connect(harmonic1Gain);
      harmonic2.connect(harmonic2Gain);

      gainNode.connect(audioContext.destination);
      harmonic1Gain.connect(audioContext.destination);
      harmonic2Gain.connect(audioContext.destination);

      // Bright, pleasant frequencies (G5, D6, G6)
      fundamental.frequency.value = 783.99; // G5
      harmonic1.frequency.value = 1174.66;  // D6
      harmonic2.frequency.value = 1567.98;  // G6

      fundamental.type = "sine";
      harmonic1.type = "sine";
      harmonic2.type = "sine";

      // Quick, uplifting envelope
      const now = audioContext.currentTime;
      const duration = 0.6;

      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

      harmonic1Gain.gain.setValueAtTime(0.15, now);
      harmonic1Gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      harmonic2Gain.gain.setValueAtTime(0.1, now);
      harmonic2Gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

      // Start and stop
      fundamental.start(now);
      harmonic1.start(now);
      harmonic2.start(now);

      fundamental.stop(now + duration);
      harmonic1.stop(now + duration);
      harmonic2.stop(now + duration);

      // Trigger ambient glow
      showAmbientGlow();
    } catch (error) {
      console.log("Echo: Could not play sound", error);
    }
  }

  // Show ambient glow animation
  function showAmbientGlow() {
    // Remove existing glow if any
    const existingGlow = document.querySelector('.echo-ambient-glow');
    if (existingGlow) {
      existingGlow.remove();
    }

    const glow = document.createElement('div');
    glow.className = 'echo-ambient-glow';
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
    console.log("Echo: showPopup called with", emoji, label, "autoHide:", autoHide);
    const popup = createPopup();
    // CSS handles positioning now (fixed top center)
    // We just need to update content and visibility

    console.log("Echo: Updating popup content", { emoji, label });

    // Update content
    const emojiEl = popup.querySelector(".echo-emoji");
    const labelEl = popup.querySelector(".echo-label");

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
        console.log("Echo: Auto-hiding popup after 8s");
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
      console.log("Echo: No draft to analyze");
      hidePopup();
      return;
    }

    // Filter trivial messages
    if (isTrivialMessage(draft)) {
      console.log("Echo: Trivial message detected, skipping analysis:", draft);
      hidePopup();
      return;
    }

    console.log("Echo: Sending draft for analysis", { draft: draft.substring(0, 50), contextLength: context.length });

    // Show loading popup immediately - DON'T auto-hide while waiting
    showPopup("⏳", "Analyzing...", false);

    // Set a timeout to hide popup if no response
    const timeoutId = setTimeout(() => {
      console.error("Echo: Analysis timeout - no response after 15 seconds");
      showPopup("❌", "Timeout");
      setTimeout(() => {
        hidePopup();
      }, 2000);
    }, 15000);

    // Safety check for extension context
    if (!chrome.runtime || !chrome.runtime.id) {
      console.warn("Echo: Extension context invalidated. Please refresh the page.");
      showPopup("🔄", "Please Refresh Tab");
      return;
    }

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
        // Handle the 'Extension context invalidated' error gracefully
        if (chrome.runtime.lastError.message.includes("context invalidated")) {
          console.warn("Echo: Connection lost due to extension update. Please refresh.");
          showPopup("🔄", "Please Refresh Tab");
        } else {
          console.error("Echo: Runtime error", chrome.runtime.lastError);
          showPopup("❌", "Error");
        }
        setTimeout(() => {
          hidePopup();
        }, 3000);
      } else {
        console.log("Echo: Analysis response received", response);
        if (response) {
          handleAnalysisResponse(response);
        } else {
          console.error("Echo: No response received");
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
      console.error("Echo: Analysis error");
      console.error("Echo: Error type:", response?.errorType);
      console.error("Echo: Error message:", response?.message);

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
          console.log("Echo: Draft empty, hiding popup");
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

  // Find Discord input element with multiple strategies
  function findDiscordInput() {
    const selectors = [
      'div[class*="textArea-"] [role="textbox"]',
      '[class*="slateTextArea-"]',
      '[data-slate-editor="true"]',
      'div[aria-label^="Message #"]',
      'div[aria-label^="Message @"]',
      'div[aria-label^="Message in"]',
      'div[aria-label^="Message"]',
      '[role="textbox"][contenteditable="true"]',
      '[aria-multiline="true"][contenteditable="true"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        // Ensure it's not a hidden or irrelevant element
        if (el.offsetParent !== null || el.getClientRects().length > 0) {
          console.log(`Echo: Found Discord input with selector: ${selector}`);
          return el;
        }
      }
    }

    // fallback: look for ANY contenteditable in the main area
    const mainArea = document.querySelector('main, [class*="chat-"]');
    if (mainArea) {
      const allEditable = mainArea.querySelectorAll('[contenteditable="true"], [role="textbox"]');
      for (const el of allEditable) {
        if (el.offsetParent !== null || el.getClientRects().length > 0) return el;
      }
    }

    // Fallback to active element if it's a textbox or in a chat area
    if (document.activeElement &&
      (document.activeElement.getAttribute('role') === 'textbox' ||
        document.activeElement.getAttribute('data-slate-editor') === 'true' ||
        document.activeElement.contentEditable === "true")) {
      return document.activeElement;
    }

    return null;
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

      console.log("Echo: Attaching input handlers to element");

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
        console.log("Echo: Input element focused");
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
          console.log("Echo: Lost draft element (chat switch?), resetting...");
          draftElement = null;
          inputHandlerAttached = false;
        }

        // Only search if we don't have a valid draft element
        if (!draftElement) {
          if (platform === "WHATSAPP") {
            draftElement = findWhatsAppInput();
          } else if (platform === "DISCORD") {
            draftElement = findDiscordInput();
          } else {
            draftElement = document.querySelector(getConfig().DRAFT_SELECTOR);
          }

          if (draftElement && !inputHandlerAttached) {
            console.log("Echo: Found new draft element");
            attachInputHandlers(draftElement);
            // Reset current draft ensures we re-analyze if needed
            currentDraft = "";
          }
        }
      }, 500); // Check at most every 500ms
    });

    observer.observe(document.body, config);
    console.log("Echo: MutationObserver set up (Optimized)");

    // Try to find input element immediately and periodically
    const findAndAttach = () => {
      if (platform === "WHATSAPP") {
        draftElement = findWhatsAppInput();
      } else if (platform === "DISCORD") {
        draftElement = findDiscordInput();
      } else {
        draftElement = document.querySelector(getConfig().DRAFT_SELECTOR);
      }

      if (draftElement) {
        console.log("Echo: Found draft element:", draftElement);
        attachInputHandlers(draftElement);
      } else {
        console.log("Echo: Draft element not found yet, will retry...");
        setTimeout(findAndAttach, 1000);
      }
    };

    // Start looking for the input element
    console.log("Echo: Starting input detection...");
    setTimeout(findAndAttach, 500);
    setTimeout(findAndAttach, 2000);
    setTimeout(findAndAttach, 5000);
  }

  // Test function - can be called from console
  window.testEcho = function () {
    console.log("Echo: Test function called");
    const draft = extractDraft();
    console.log("Current draft:", draft);
    showPopup("😊", "Test Popup");
    setTimeout(() => {
      hidePopup();
    }, 3000);
  };

  // Initialize
  function init() {
    console.log("Echo: Initializing content script");

    // Only set up observers if platform is supported
    if (platform) {
      console.log(`Echo: Initializing for ${platform}`);
      // Create popup and modal elements
      createPopup();
      createModal();

      // Test popup visibility
      setTimeout(() => {
        const testPopup = document.querySelector(".echo-popup");
        if (testPopup) {
          console.log("Echo: Popup element exists in DOM");
        } else {
          console.error("Echo: Popup element NOT found in DOM!");
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
