import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

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

export const DEFAULT_SETTINGS: Settings = {
  hotkey: 'CommandOrControl+Shift+Space',
  micHotkey: 'CommandOrControl+Shift+M',
  provider: 'claude',
  model: 'claude-opus-4-8',
  deepThinking: true,
  answerDepth: 'deep',
  includeResources: true,
  readAloud: false,
  ttsEngine: 'natural',
  ttsRate: 1.0,
  ttsVoice: '',
  sttLang: 'en-US',
  autoVoice: false,
  launchAtStartup: true,
  persona: ''
}

interface StoreFile {
  settings: Settings
  apiKeyEnc?: string // base64 of safeStorage-encrypted API key
}

let cache: StoreFile | null = null

function storePath(): string {
  return join(app.getPath('userData'), 'digitutor-config.json')
}

function load(): StoreFile {
  if (cache) return cache
  const path = storePath()
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'))
      cache = {
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        apiKeyEnc: raw.apiKeyEnc
      }
      return cache
    } catch {
      // Corrupt file — fall through to defaults.
    }
  }
  cache = { settings: { ...DEFAULT_SETTINGS } }
  return cache
}

function persist(): void {
  if (!cache) return
  writeFileSync(storePath(), JSON.stringify(cache, null, 2), 'utf-8')
}

export function getSettings(): Settings {
  return { ...load().settings }
}

export function saveSettings(partial: Partial<Settings>): Settings {
  const data = load()
  data.settings = { ...data.settings, ...partial }
  persist()
  return { ...data.settings }
}

export function hasApiKey(): boolean {
  return !!load().apiKeyEnc
}

export function setApiKey(key: string): void {
  const data = load()
  if (!key) {
    data.apiKeyEnc = undefined
  } else if (safeStorage.isEncryptionAvailable()) {
    data.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
  } else {
    // Fallback: store as base64 (not encrypted) if OS keychain is unavailable.
    data.apiKeyEnc = 'plain:' + Buffer.from(key, 'utf-8').toString('base64')
  }
  persist()
}

export function getApiKey(): string | null {
  const enc = load().apiKeyEnc
  if (!enc) return null
  if (enc.startsWith('plain:')) {
    return Buffer.from(enc.slice('plain:'.length), 'base64').toString('utf-8')
  }
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}
