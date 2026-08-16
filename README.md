# DigiTutor

A study tutor that lives in your system tray. Press a hotkey while studying and DigiTutor
**screenshots your screen, listens to your question, and answers with AI** in a small
popup at the bottom-right of your screen — answers stream in with proper math rendering,
can be read aloud, and can suggest study resources.

Built for the workflow of: "I'm stuck on this slide → hotkey → talk → get a clear answer."

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

```bash
npm install
npm run dev
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
```

## Architecture

```
src/
  main/            Electron main process (Node)
    index.ts       app lifecycle, tray, global hotkey, windows, IPC
    screenshot.ts  screen capture via desktopCapturer
    store.ts       JSON settings + fail-closed API key protection (safeStorage)
    icon.ts        runtime-generated tray/app icons (no binary assets)
    ai/            swappable provider layer (Claude + OpenAI), system prompt
  preload/         contextBridge API exposed to the renderer
  renderer/
    popup/         the bottom-right popup: capture preview, local Whisper voice input,
                   streaming answer with Markdown + KaTeX, Kokoro/system speech output
    settings/      provider, model, key, hotkey, voice, persona settings
```

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
- Provider is swappable; Claude is the default and best for screenshots of slides/math.
