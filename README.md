# DigiTutor

A study tutor that lives in your system tray. Press a hotkey while studying and DigiTutor
**screenshots your screen, listens to your question, and answers with AI** in a small
popup at the bottom-right of your screen — answers stream in with proper math rendering,
can be read aloud, and can suggest study resources.

Built for the workflow of: "I'm stuck on this slide → hotkey → talk → get a clear answer."

[Download DigiTutor](https://yourdigitutor.netlify.app/) · [View the source on GitHub](https://github.com/Alp-Iskin/DigiTutor)

This is a student project by Alp Iskin. I began with the screen-aware tutor idea and
expanded it through iterative, AI-assisted development. I can explain the architecture,
the security tradeoffs, and the testing behind the current version.

## How it works

1. Press the global hotkey (default **Ctrl+Shift+Space**).
2. DigiTutor captures the screen you're looking at and a popup appears bottom-right.
3. By default, type your question or click the microphone to start listening. The
   microphone-only hotkey (default **Ctrl+Shift+M**) opens without a screenshot and
   starts listening immediately. Enable **Auto-listen** if you want listening to start
   after each screenshot. When the popup is already open and not answering, the
   microphone-only hotkey toggles listening.
4. Press **Enter** or click **➤** to send. The global hotkey does not send: while the
   popup is open, it captures and adds another screenshot for the next send.
5. The answer streams back with formatted math and can optionally be read aloud.
6. Use **＋** to clear the chat and start a new session. **Esc** hides the popup without
   clearing the session. On macOS, the defaults use **Cmd** instead of **Ctrl**.

## Setup

Development requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

Run the local engineering checks with:

```bash
npm run validate   # TypeScript, exact Anthropic SDK pin, fail-closed key policy
npm run build      # bundle main, preload, and renderer code
```

On first launch, open **Settings** (tray icon → Settings, or the ⚙ in the popup) and
paste your API key. When Electron can use protected OS storage, the key is encrypted on
your device and leaves it only in calls to your chosen AI provider. DigiTutor never
stores a newly entered key if protected storage is unavailable; Settings explains how
to enable or unlock the OS keychain/secret store. Legacy `plain:` base64 values are
left unchanged but disabled; paste the key again once secure storage is available to
replace the legacy value securely.

- **Claude (recommended):** get a key at https://console.anthropic.com → default model `claude-opus-4-8`.
- **OpenAI:** use a vision-capable model like `gpt-4o`.

## Build a distributable

```bash
npm run build      # bundles main + preload + renderer into out/
npm run dist       # builds and packages the current platform with electron-builder
npm run dist:mac   # unsigned universal DMG for Apple Silicon + Intel Macs
npm run dist:win   # unsigned x64 installer for Windows 10/11
```

The downloadable builds are not code-signed yet. Windows may show SmartScreen, and
macOS may require approval in **System Settings → Privacy & Security**. macOS also asks
for Screen Recording and Microphone permission when those features are first used.
The Windows x64 package is built on GitHub's Windows runner, while the universal macOS
package contains both Apple Silicon and Intel executables. That confirms the packaging,
not every hardware, permission, or provider combination; broader runtime testing is
still part of the roadmap.

## Architecture

```
src/
  main/            Electron main process (Node)
    index.ts       app lifecycle, tray, global hotkey, windows, IPC
    screenshot.ts  screen capture via desktopCapturer
    store.ts       JSON settings + fail-closed API key protection (safeStorage)
    icon.ts        runtime-generated tray/app icons
    ai/            swappable provider layer (Claude + OpenAI), system prompt
  preload/         contextBridge API exposed to the renderer
  renderer/
    popup/         the bottom-right popup: capture preview, local Whisper voice input,
                   streaming answer with Markdown + KaTeX, Kokoro/system speech output
    settings/      provider, model, key, hotkey, voice, persona settings
```

The main process owns screen capture, provider calls, and stored credentials. Renderer
windows use context isolation and a narrow `contextBridge` API, although Electron's full
renderer sandbox is not enabled. A newly typed key crosses once from Settings to the main
process through the `setApiKey` IPC method; an existing stored key is never returned to a
renderer. The main process encrypts it with `safeStorage`, refuses new storage when OS
protection is unavailable, and disables legacy plaintext values. Model-produced Markdown
and math are sanitized with DOMPurify before being inserted into the popup.

Runtime tray icons are drawn in `src/main/icon.ts`; `scripts/gen-icon.mjs` produces the
PNG and ICO assets used by the platform packagers.

## Notes & roadmap

- **Voice input** runs `onnx-community/whisper-small` locally in a Web Worker through
  Transformers.js. The model is downloaded from Hugging Face on first use and cached,
  so the first load needs internet; after that, transcription can run offline and
  microphone audio is not sent to a speech API. WebGPU is preferred, with WASM as the
  fallback.
- **Read aloud** can use the local `onnx-community/Kokoro-82M-v1.0-ONNX` neural voice
  or Chromium's system voices. Kokoro is also downloaded and cached on first use, then
  generates speech locally in a Web Worker (WebGPU preferred, WASM fallback).
- **Resources/diagrams:** answers can include a Resources section with reputable links.
  Richer features (pulling diagrams, screen *recording* instead of a single shot) are
  future work.
- Provider is swappable; Claude is the default and recommended option for screenshot-based questions.
