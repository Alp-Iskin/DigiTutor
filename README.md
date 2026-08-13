# DigiTutor

A study tutor that lives in your system tray. Press a hotkey while studying and DigiTutor
**screenshots your screen, listens to your question, and answers with AI** in a small
popup at the bottom-right of your screen — answers stream in with proper math rendering,
can be read aloud, and can suggest study resources.

Built for the workflow of: "I'm stuck on this slide → hotkey → talk → get a clear answer."

## How it works

1. Press the global hotkey (default **Ctrl+Shift+Space**).
2. DigiTutor captures the screen you're looking at and a popup appears bottom-right.
3. It starts listening — speak your question (or just type it). The screenshot is shown.
4. Press **Enter**, click **➤**, or press the hotkey again to send.
5. The answer streams back with formatted math and (optionally) is read aloud.
6. Press the hotkey again to re-capture for a new question; **Esc** closes the popup.

## Setup

```bash
npm install
npm run dev
```

On first launch, open **Settings** (tray icon → Settings, or the ⚙ in the popup) and
paste your API key. The key is stored **encrypted on your device** (via the OS keychain)
and never leaves your machine except in calls to your chosen AI provider.

- **Claude (recommended):** get a key at https://console.anthropic.com → default model `claude-opus-4-8`.
- **OpenAI:** use a vision-capable model like `gpt-4o`.

## Build a distributable

```bash
npm run build      # bundles main + preload + renderer into out/
```

(Packaging into a Windows installer with electron-builder is a planned next step.)

## Architecture

```
src/
  main/            Electron main process (Node)
    index.ts       app lifecycle, tray, global hotkey, windows, IPC
    screenshot.ts  screen capture via desktopCapturer
    store.ts       JSON settings + encrypted API key (safeStorage)
    icon.ts        runtime-generated tray/app icons (no binary assets)
    ai/            swappable provider layer (Claude + OpenAI), system prompt
  preload/         contextBridge API exposed to the renderer
  renderer/
    popup/         the bottom-right popup: capture preview, voice/text input,
                   streaming answer with Markdown + KaTeX, text-to-speech
    settings/      provider, model, key, hotkey, voice, persona settings
```

## Notes & roadmap

- **Voice input** uses the browser Web Speech API. Electron ships without Google's
  speech key, so on some builds voice may be unavailable — you can always type, and the
  popup tells you if voice didn't start. A bundled **offline Whisper** engine is the
  planned upgrade for reliable transcription.
- **Resources/diagrams:** answers can include a Resources section with reputable links.
  Richer features (pulling diagrams, screen *recording* instead of a single shot) are
  future work.
- Provider is swappable; Claude is the default and best for screenshots of slides/math.
