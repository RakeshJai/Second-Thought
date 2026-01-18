// background.js - The Secure Bridge
// Handles secure communication with Gemini API
// and manages API key storage

console.log("Second Thought Background Service Worker Loaded");

// API Configuration
const API_CONFIG = {
  OPENROUTER_API_URL: "https://openrouter.ai/api/v1/chat/completions",
  API_KEY_STORAGE: "openrouter_api_key",
  DEFAULT_MODEL: "mistralai/devstral-2512:free", // Free model
  DEFAULT_PROMPT: `Act as a Social Intelligence Expert. Analyze the following chat draft in the context of the conversation history.
  
  Note on history format:
  - Messages labeled "[Me]" are from the user (the writer of the current draft).
  - Messages labeled "[Them]" are from the conversation partner.

Your task:
1. Calculate a relationship score (0-100) based on the conversation history, considering:
   - Sentiment trends
   - Communication frequency and patterns
   - Tone consistency
   - Conflict indicators
   - Overall rapport quality

2. Determine the PRIMARY emotion the recipient will most likely feel when reading this draft message

3. Select an appropriate emoji that best represents this emotion (e.g., 😠 for anger, 😢 for sadness, 😊 for joy, 😕 for confusion, 😤 for frustration, 😑 for annoyance, etc.)

4. Analyze the tone of the message

5. Provide a detailed perception analysis of how the recipient will interpret this message

6. If the message could be improved, suggest a more mindful version

IMPORTANT: Return ONLY a valid JSON object with this exact structure (no markdown, no code blocks, just pure JSON):
{
  "relationship_score": <number 0-100>,
  "primary_emotion": "<emotion name>",
  "emoji": "<single emoji character>",
  "tone": "<description of tone>",
  "recipient_feeling": "<how recipient might feel>",
  "perception_analysis": "<detailed analysis of how recipient will perceive this>",
  "improved_draft": "<improved version if needed, or same as original if fine>",
  "has_significant_emotion": <true if emotion is significant/negative, false if neutral/positive>
}`
};

// Message Types
const MESSAGE_TYPES = {
  ANALYZE_DRAFT: "ANALYZE_DRAFT",
  API_KEY_SAVED: "API_KEY_SAVED",
  ANALYSIS_RESULT: "ANALYSIS_RESULT",
  ERROR: "ERROR"
};

// Error Types
const ERROR_TYPES = {
  NO_API_KEY: "NO_API_KEY",
  NO_DRAFT: "NO_DRAFT",
  API_ERROR: "API_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR"
};

// Initialize storage
async function initializeStorage() {
  try {
    const result = await chrome.storage.local.get([API_CONFIG.API_KEY_STORAGE]);
    if (!result[API_CONFIG.API_KEY_STORAGE]) {
      console.log("Second Thought: No API key found in storage");
    } else {
      console.log("Second Thought: API key loaded from storage");
    }
  } catch (error) {
    console.error("Second Thought: Error initializing storage", error);
  }
}

// Save API key to storage
async function saveApiKey(apiKey) {
  try {
    await chrome.storage.local.set({ [API_CONFIG.API_KEY_STORAGE]: apiKey });
    console.log("Second Thought: API key saved successfully");
    return { success: true };
  } catch (error) {
    console.error("Second Thought: Error saving API key", error);
    return { success: false, error: error.message };
  }
}

// Get API key from storage
async function getApiKey() {
  try {
    const result = await chrome.storage.local.get([API_CONFIG.API_KEY_STORAGE]);
    return result[API_CONFIG.API_KEY_STORAGE];
  } catch (error) {
    console.error("Second Thought: Error getting API key", error);
    return null;
  }
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

// Analyze draft using Gemini API
async function analyzeDraft(draft, context) {
  const apiKey = await getApiKey();

  if (!apiKey) {
    console.error("Second Thought: No API key found");
    return {
      type: MESSAGE_TYPES.ERROR,
      errorType: ERROR_TYPES.NO_API_KEY,
      message: "API key not found. Please set your API key in settings."
    };
  }

  if (!draft || draft.trim().length === 0) {
    console.error("Second Thought: No draft to analyze");
    return {
      type: MESSAGE_TYPES.ERROR,
      errorType: ERROR_TYPES.NO_DRAFT,
      message: "No draft detected for analysis."
    };
  }

  // Filter trivial messages
  if (isTrivialMessage(draft)) {
    console.log("Second Thought: Trivial message detected, skipping analysis");
    return {
      type: MESSAGE_TYPES.ANALYSIS_RESULT,
      result: {
        relationship_score: 50,
        primary_emotion: "neutral",
        emoji: "😐",
        tone: "neutral",
        recipient_feeling: "neutral",
        perception_analysis: "Trivial message - no significant emotional impact expected.",
        improved_draft: draft,
        has_significant_emotion: false
      },
      originalDraft: draft,
      isTrivial: true
    };
  }

  try {
    // Get selected model from storage
    const storageResult = await chrome.storage.local.get(["selected_model"]);
    const selectedModel = storageResult.selected_model || API_CONFIG.DEFAULT_MODEL;

    console.log("Second Thought: Sending request to OpenRouter API");
    console.log("Second Thought: Using model:", selectedModel);

    // Build context string with conversation history (limit to avoid token limits)
    const limitedContext = context.slice(-5); // Only last 5 messages
    const contextString = limitedContext.length > 0
      ? `Conversation History (most recent first):\n${limitedContext.map((msg, idx) => `${idx + 1}. ${msg.substring(0, 100)}`).join("\n")}`
      : "No previous conversation history available.";

    // OpenRouter uses OpenAI-compatible format
    const requestBody = {
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: API_CONFIG.DEFAULT_PROMPT
        },
        {
          role: "user",
          content: `${contextString}

Draft Message to Analyze: "${draft}"

Remember: Return ONLY valid JSON, no markdown formatting, no code blocks.`
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    };

    // Add timeout to fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(API_CONFIG.OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": chrome.runtime.getURL(""),
        "X-Title": "Second Thought Extension"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData = {};
      let errorText = "";

      try {
        errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { raw: errorText };
      }

      console.error("Second Thought: API error - Status:", response.status);
      console.error("Second Thought: API error - Status Text:", response.statusText);
      console.error("Second Thought: API error - Response:", errorText);
      console.error("Second Thought: API error - Parsed:", JSON.stringify(errorData, null, 2));

      const errorMessage = errorData.error?.message ||
        errorData.message ||
        errorData.error?.status ||
        response.statusText ||
        "Unknown API error";

      return {
        type: MESSAGE_TYPES.ERROR,
        errorType: ERROR_TYPES.API_ERROR,
        message: `API error (${response.status}): ${errorMessage}`,
        details: errorData,
        status: response.status
      };
    }

    const responseData = await response.json();
    console.log("Second Thought: API response received");
    console.log("Second Thought: Response structure:", {
      hasChoices: !!responseData.choices,
      choicesLength: responseData.choices?.length,
      hasMessage: !!responseData.choices?.[0]?.message,
      hasContent: !!responseData.choices?.[0]?.message?.content
    });

    // Extract the JSON response from OpenRouter (OpenAI-compatible format)
    let analysisResult;
    try {
      // OpenRouter returns choices[0].message.content
      const content = responseData.choices?.[0]?.message?.content;
      if (content) {
        // Clean up the response to extract JSON
        // Remove markdown code blocks if present
        let cleanedContent = content.trim();
        cleanedContent = cleanedContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

        // Try to find JSON object
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);

          // Validate and set defaults for required fields
          analysisResult.relationship_score = analysisResult.relationship_score ?? 50;
          analysisResult.primary_emotion = analysisResult.primary_emotion ?? "neutral";
          analysisResult.emoji = analysisResult.emoji ?? "😐";
          analysisResult.tone = analysisResult.tone ?? "neutral";
          analysisResult.recipient_feeling = analysisResult.recipient_feeling ?? "neutral";
          analysisResult.perception_analysis = analysisResult.perception_analysis ?? "Unable to analyze perception.";
          analysisResult.improved_draft = analysisResult.improved_draft ?? draft;
          analysisResult.has_significant_emotion = analysisResult.has_significant_emotion ?? false;
        } else {
          // Fallback if JSON parsing fails
          console.warn("Second Thought: Could not extract JSON, using fallback");
          analysisResult = {
            relationship_score: 50,
            primary_emotion: "neutral",
            emoji: "😐",
            tone: "Unknown",
            recipient_feeling: "Unknown",
            perception_analysis: "Analysis incomplete - could not parse response.",
            improved_draft: draft,
            has_significant_emotion: false
          };
        }
      } else {
        throw new Error("No content in API response");
      }
    } catch (parseError) {
      console.error("Second Thought: Error parsing API response", parseError);
      analysisResult = {
        relationship_score: 50,
        primary_emotion: "neutral",
        emoji: "😐",
        tone: "Analysis failed",
        recipient_feeling: "Could not determine",
        perception_analysis: "Error analyzing message - please try again.",
        improved_draft: draft,
        has_significant_emotion: false
      };
    }

    return {
      type: MESSAGE_TYPES.ANALYSIS_RESULT,
      result: analysisResult,
      originalDraft: draft
    };

  } catch (error) {
    console.error("Second Thought: Network error", error);

    let errorMessage = `Network error: ${error.message}`;
    if (error.name === 'AbortError') {
      errorMessage = "Request timeout - API took too long to respond";
    }

    return {
      type: MESSAGE_TYPES.ERROR,
      errorType: ERROR_TYPES.NETWORK_ERROR,
      message: errorMessage
    };
  }
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Second Thought: Message received", request);

  (async () => {
    try {
      switch (request.action) {
        case MESSAGE_TYPES.ANALYZE_DRAFT:
          const { draft, context } = request.payload;
          const analysisResult = await analyzeDraft(draft, context);
          sendResponse(analysisResult);
          break;

        case MESSAGE_TYPES.API_KEY_SAVED:
          const { apiKey } = request.payload;
          const saveResult = await saveApiKey(apiKey);
          sendResponse(saveResult);
          break;

        default:
          console.error("Second Thought: Unknown action", request.action);
          sendResponse({
            type: MESSAGE_TYPES.ERROR,
            message: "Unknown action"
          });
      }
    } catch (error) {
      console.error("Second Thought: Error handling message", error);
      sendResponse({
        type: MESSAGE_TYPES.ERROR,
        message: `Error handling message: ${error.message}`
      });
    }
  })();

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Initialize
console.log("Second Thought: Initializing background service worker");
initializeStorage();