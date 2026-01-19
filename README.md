# Echo - Hear What They'll Feel 🌊

![Echo Logo](icons/icon128.png)

**Echo** is a powerful AI-driven browser extension designed to help you communicate more mindfully on **WhatsApp** and **Discord**. By analyzing your chat drafts in real-time, Echo predicts how your message might be perceived, detects underlying emotions, and offers intelligent suggestions to ensure your intent matches your impact.

---

## ✨ Key Features

- 🧠 **Real-Time Tone Analysis**: Analyzes your messages as you type to ensure you hit the right note.
- 🎭 **Emotion Detection**: Instantly identifies the primary emotion of your draft with intuitive emoji feedback.
- 🔊 **Mindful Alerts**: Features a subtle, bright "ding" and ambient glow when a significant emotion is detected, prompting a second thought before you hit send.
- 🔄 **AI-Powered Suggestions**: Offers re-drafted alternatives to improve clarity, tone, and empathy.
- 📋 **One-Click Copy**: Seamlessly apply AI suggestions to your clipboard.
- 💬 **Context Awareness**: Analyzes previous messages in the chat (tagged as [Me] or [Them]) to provide highly relevant feedback.
- ⚙️ **Customizable AI Models**: Choose between various neural models (Gemini, Llama, Mistral, GPT) via OpenRouter integration.

---

## 🛠️ Technology Stack

- **Core**: JavaScript (Chrome Extension Manifest V3)
- **Real-time Detection**: `MutationObserver` for seamless draft monitoring.
- **UI/UX**: Vanilla CSS with modern glassmorphism, fluid animations, and Google Fonts (Outfit).
- **AI Integration**: [OpenRouter API](https://openrouter.ai/) for access to state-of-the-art Large Language Models.
- **Audio**: Web Audio API for sophisticated, non-intrusive sound cues.

---

## 🚀 Installation & Setup

### 1. Requirements
- A Chromium-based browser (Chrome, Edge, Brave, etc.)
- An [OpenRouter API Key](https://openrouter.ai/keys)

### 2. Install the Extension
1. Download or clone this repository.
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top right corner.
4. Click **"Load unpacked"** and select the root directory of this project.

### 3. Configuration
1. Click the Echo icon in your browser toolbar to open the **Side Panel**.
2. Enter your **OpenRouter API Key**.
3. Select your preferred **Neural Model**.
4. Click **Apply Changes**.

---

## 📖 How to Use

1. **Start Typing**: Open WhatsApp Web or Discord and begin typing a message.
2. **Instant Feedback**: An emoji popup will appear at the top of your screen showing the detected emotion.
3. **Analyze**: Click the popup to see a detailed breakdown in the Side Panel, including:
   - **Perception Analysis**: How the recipient might feel.
   - **Tone Breakdown**: Friendly, professional, or aggressive.
   - **Improved Draft**: A suggested version of your message.
4. **Apply**: Click the suggestion box to copy it to your clipboard.

---

## 🎨 Visual Preview

| Real-time Popup | Detailed Analysis Side Panel |
| :---: | :---: |
| ![Popup Preview](icons/icon48.png) | ![Side Panel Preview](icons/icon128.png) |

*(Detailed screenshots coming soon)*

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for new features or improvements, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

*Made with ❤️ for better communication.*
