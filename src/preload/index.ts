import { contextBridge, ipcRenderer } from 'electron'

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

const api = {
  // ---- popup activation ----
  onActivate: (cb: (p: ActivatePayload) => void) =>
    ipcRenderer.on('popup:activate', (_e, p) => cb(p)),
  onAddShot: (cb: (p: { screenshot: string }) => void) =>
    ipcRenderer.on('popup:add-shot', (_e, p) => cb(p)),
  onStartListen: (cb: () => void) => ipcRenderer.on('popup:start-listen', () => cb()),

  // ---- AI ----
  ask: (payload: {
    messages: Array<{ role: 'user' | 'assistant'; text: string; images: string[] }>
  }) =>
    ipcRenderer.invoke('ai:ask', payload) as Promise<
      { ok: true; text: string } | { ok: false; error: string }
    >,
  cancel: () => ipcRenderer.invoke('ai:cancel'),
  onChunk: (cb: (text: string) => void) =>
    ipcRenderer.on('ai:chunk', (_e, t) => cb(t)),

  // ---- popup window controls ----
  hidePopup: () => ipcRenderer.send('popup:hide'),
  resizePopup: (height: number) => ipcRenderer.send('popup:resize', height),
  openSettings: () => ipcRenderer.send('settings:open'),
  openLink: (url: string) => ipcRenderer.send('link:open', url),

  // ---- settings ----
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
  saveSettings: (partial: Partial<Settings>) =>
    ipcRenderer.invoke('settings:save', partial) as Promise<{
      settings: Settings
      hotkeyError: boolean
    }>,
  getApiKeyStatus: () =>
    ipcRenderer.invoke('settings:apikey-status') as Promise<boolean>,
  setApiKey: (key: string) =>
    ipcRenderer.invoke('settings:apikey-set', key) as Promise<boolean>
}

contextBridge.exposeInMainWorld('digitutor', api)

export type DigiTutorApi = typeof api
