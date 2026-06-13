export interface Settings {
  hotkey: string
  micHotkey: string
  provider: 'claude' | 'openai'
  model: string
  deepThinking: boolean
  answerDepth: 'deep' | 'classic'
  includeResources: boolean
  readAloud: boolean
  ttsEngine: 'natural' | 'system'
  ttsRate: number
  ttsVoice: string
  sttLang: string
  autoVoice: boolean
  launchAtStartup: boolean
  persona: string
}

export interface ActivatePayload {
  screenshot: string | null
  settings: Settings
  hasKey: boolean
  autoListen?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  images: string[]
}

export interface DigiTutorApi {
  onActivate(cb: (p: ActivatePayload) => void): void
  onAddShot(cb: (p: { screenshot: string }) => void): void
  onStartListen(cb: () => void): void
  ask(payload: {
    messages: ChatMessage[]
  }): Promise<{ ok: true; text: string } | { ok: false; error: string }>
  cancel(): Promise<boolean>
  onChunk(cb: (text: string) => void): void
  hidePopup(): void
  resizePopup(height: number): void
  openSettings(): void
  openLink(url: string): void
  getSettings(): Promise<Settings>
  saveSettings(
    partial: Partial<Settings>
  ): Promise<{ settings: Settings; hotkeyError: boolean }>
  getApiKeyStatus(): Promise<boolean>
  setApiKey(key: string): Promise<boolean>
}

declare global {
  interface Window {
    digitutor: DigiTutorApi
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
    SpeechRecognition?: new () => SpeechRecognitionLike
  }

  interface SpeechRecognitionLike {
    lang: string
    continuous: boolean
    interimResults: boolean
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionResultEvent) => void) | null
    onerror: ((event: { error: string }) => void) | null
    onend: (() => void) | null
  }

  interface SpeechRecognitionResultEvent {
    resultIndex: number
    results: ArrayLike<{
      isFinal: boolean
      0: { transcript: string }
    }>
  }
}

export {}
