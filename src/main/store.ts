import { app, safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  ApiKeySaveResult,
  ApiKeyStatus,
  classifyStoredApiKey,
  readUsableApiKey
} from './api-key-policy'

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
  apiKeyEnc?: string // base64 of a safeStorage-encrypted API key
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
        apiKeyEnc: typeof raw.apiKeyEnc === 'string' ? raw.apiKeyEnc : undefined
      }
      return cache
    } catch {
      // Corrupt file - fall through to defaults.
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

// Electron can fall back to `basic_text` on Linux. That backend is reversible
// obfuscation, not protected secret storage, so fail closed there too.
function secureStorageAvailable(): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend()
      if (backend === 'basic_text' || backend === 'unknown') return false
    }
    return true
  } catch {
    return false
  }
}

function decryptStoredKey(encoded: string): string {
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

export function getApiKeyStatus(): ApiKeyStatus {
  return classifyStoredApiKey(
    load().apiKeyEnc,
    secureStorageAvailable(),
    decryptStoredKey
  )
}

export function setApiKey(key: string): ApiKeySaveResult {
  const data = load()
  if (!key) {
    const previous = data.apiKeyEnc
    data.apiKeyEnc = undefined
    try {
      persist()
      return { ok: true, status: getApiKeyStatus() }
    } catch {
      data.apiKeyEnc = previous
      return { ok: false, error: 'write-failed', status: getApiKeyStatus() }
    }
  }

  if (!secureStorageAvailable()) {
    return {
      ok: false,
      error: 'secure-storage-unavailable',
      status: getApiKeyStatus()
    }
  }

  let encrypted: string
  try {
    const encryptedBuffer = safeStorage.encryptString(key)
    // Verify the protected value before replacing anything already stored.
    if (safeStorage.decryptString(encryptedBuffer) !== key) throw new Error('round-trip failed')
    encrypted = encryptedBuffer.toString('base64')
  } catch {
    return { ok: false, error: 'encryption-failed', status: getApiKeyStatus() }
  }

  const previous = data.apiKeyEnc
  data.apiKeyEnc = encrypted
  try {
    persist()
    return { ok: true, status: getApiKeyStatus() }
  } catch {
    data.apiKeyEnc = previous
    return { ok: false, error: 'write-failed', status: getApiKeyStatus() }
  }
}

export function getApiKey(): string | null {
  return readUsableApiKey(load().apiKeyEnc, secureStorageAvailable(), decryptStoredKey)
}
