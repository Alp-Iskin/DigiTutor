import './styles.css'
import { NATURAL_VOICES } from '../popup/voices'
import type { ApiKeySaveError, ApiKeyStatus } from '../../main/api-key-policy'
import type { Settings } from '../global'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const el = {
  provider: $<HTMLSelectElement>('provider'),
  model: $<HTMLInputElement>('model'),
  modelHelp: $('model-help'),
  apikey: $<HTMLInputElement>('apikey'),
  saveKey: $<HTMLButtonElement>('save-key'),
  keyStatus: $('key-status'),
  hotkey: $<HTMLInputElement>('hotkey'),
  micHotkey: $<HTMLInputElement>('micHotkey'),
  launchAtStartup: $<HTMLInputElement>('launchAtStartup'),
  autoVoice: $<HTMLInputElement>('autoVoice'),
  answerDepth: $<HTMLSelectElement>('answerDepth'),
  depthHelp: $('depth-help'),
  deepThinking: $<HTMLInputElement>('deepThinking'),
  includeResources: $<HTMLInputElement>('includeResources'),
  persona: $<HTMLTextAreaElement>('persona'),
  sttLang: $<HTMLSelectElement>('sttLang'),
  readAloud: $<HTMLInputElement>('readAloud'),
  ttsEngine: $<HTMLSelectElement>('ttsEngine'),
  engineHelp: $('engine-help'),
  ttsVoice: $<HTMLSelectElement>('ttsVoice'),
  ttsRate: $<HTMLInputElement>('ttsRate'),
  rateVal: $('rate-val'),
  save: $<HTMLButtonElement>('save'),
  saved: $('saved')
}

const MODEL_HINTS: Record<string, string> = {
  claude: 'Recommended: claude-opus-4-8 (best vision + reasoning). Lighter/cheaper: claude-sonnet-4-6.',
  openai: 'e.g. gpt-4o or gpt-4o-mini (must be a vision-capable model).'
}
const DEFAULT_MODEL: Record<string, string> = {
  claude: 'claude-opus-4-8',
  openai: 'gpt-4o'
}
const DEPTH_HELP: Record<string, string> = {
  deep: 'Richer, more nuanced answers - mechanisms, evidence, trade-offs - sourced from a broad range of reputable references (studies, courses, respected experts).',
  classic: 'Shorter, focused, step-by-step answers - the original DigiTutor style.'
}
const ENGINE_HELP: Record<string, string> = {
  natural: 'Downloads a small voice model the first time read-aloud runs, then speaks locally. Much more lifelike.',
  system: "Uses your computer's built-in voices. No download, but sounds more robotic."
}

function updateModelHelp(): void {
  el.modelHelp.textContent = MODEL_HINTS[el.provider.value] ?? ''
}
function updateDepthHelp(): void {
  el.depthHelp.textContent = DEPTH_HELP[el.answerDepth.value] ?? ''
}
function updateEngineHelp(): void {
  el.engineHelp.textContent = ENGINE_HELP[el.ttsEngine.value] ?? ''
}

const SAVE_ERROR: Record<ApiKeySaveError, string> = {
  'secure-storage-unavailable':
    'Not saved; any existing value was left unchanged. Enable or unlock your OS keychain/secret store, restart DigiTutor, and paste the key again.',
  'encryption-failed':
    'Not saved; any existing value was left unchanged because secure encryption failed. Restart DigiTutor and paste the key again.',
  'write-failed':
    'Not saved; the previous in-memory value was restored because the settings file could not be written. Check its permissions and try again.'
}

function renderKeyStatus(status: ApiKeyStatus, saveError?: ApiKeySaveError): void {
  const unavailable = !status.canStoreSecurely
  if (unavailable) el.apikey.value = ''
  el.apikey.disabled = unavailable
  el.saveKey.disabled = unavailable

  if (saveError) {
    el.keyStatus.textContent = SAVE_ERROR[saveError]
    el.keyStatus.className = 'error'
    return
  }

  if (status.state === 'ready') {
    el.keyStatus.textContent = 'set securely ✓'
    el.keyStatus.className = 'set'
  } else if (status.state === 'legacy-insecure') {
    el.keyStatus.textContent = unavailable
      ? 'A legacy base64 key is present but disabled and unchanged. Enable or unlock your OS keychain/secret store, restart DigiTutor, then paste the key again to replace it securely.'
      : 'A legacy base64 key is present but disabled and unchanged. Paste the key again to replace it with secure storage.'
    el.keyStatus.className = 'error'
  } else if (status.state === 'locked') {
    el.keyStatus.textContent =
      'An encrypted key exists, but secure OS storage is unavailable. Enable or unlock your keychain/secret store and restart DigiTutor.'
    el.keyStatus.className = 'error'
  } else if (status.state === 'unreadable') {
    el.keyStatus.textContent =
      'The stored encrypted key could not be decrypted. Paste the key again to replace it securely.'
    el.keyStatus.className = 'error'
  } else if (unavailable) {
    el.keyStatus.textContent =
      'not set. Enable or unlock your OS keychain/secret store, restart DigiTutor, then paste the key.'
    el.keyStatus.className = 'error'
  } else {
    el.keyStatus.textContent = 'not set'
    el.keyStatus.className = 'unset'
  }
}

async function refreshKeyStatus(): Promise<void> {
  renderKeyStatus(await window.digitutor.getApiKeyStatus())
}

// Populate the Voice dropdown based on the chosen engine. Natural = Kokoro's
// curated voices; System = whatever Chromium/Windows exposes.
function loadVoices(selected: string): void {
  if (el.ttsEngine.value === 'natural') {
    el.ttsVoice.innerHTML = ''
    for (const v of NATURAL_VOICES) {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = v.label
      if (v.id === selected) opt.selected = true
      el.ttsVoice.appendChild(opt)
    }
    if (!NATURAL_VOICES.some((v) => v.id === selected)) el.ttsVoice.value = 'af_heart'
    return
  }
  const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []
  el.ttsVoice.innerHTML = '<option value="">System default</option>'
  for (const v of voices) {
    const opt = document.createElement('option')
    opt.value = v.name
    opt.textContent = `${v.name} (${v.lang})`
    if (v.name === selected) opt.selected = true
    el.ttsVoice.appendChild(opt)
  }
}

async function init(): Promise<void> {
  const s: Settings = await window.digitutor.getSettings()
  el.provider.value = s.provider
  el.model.value = s.model
  el.hotkey.value = s.hotkey
  el.micHotkey.value = s.micHotkey
  el.launchAtStartup.checked = s.launchAtStartup
  el.autoVoice.checked = s.autoVoice
  el.answerDepth.value = s.answerDepth
  el.deepThinking.checked = s.deepThinking
  el.includeResources.checked = s.includeResources
  el.persona.value = s.persona
  el.sttLang.value = s.sttLang
  el.readAloud.checked = s.readAloud
  el.ttsEngine.value = s.ttsEngine
  el.ttsRate.value = String(s.ttsRate)
  el.rateVal.textContent = s.ttsRate.toFixed(1)
  updateModelHelp()
  updateDepthHelp()
  updateEngineHelp()
  loadVoices(s.ttsVoice)
  if (window.speechSynthesis) {
    // Only the System engine depends on the async voice list.
    window.speechSynthesis.onvoiceschanged = () => {
      if (el.ttsEngine.value === 'system') loadVoices(s.ttsVoice)
    }
  }
  await refreshKeyStatus()
}

el.provider.addEventListener('change', () => {
  updateModelHelp()
  if (!el.model.value.trim()) el.model.value = DEFAULT_MODEL[el.provider.value]
})

el.answerDepth.addEventListener('change', updateDepthHelp)

el.ttsEngine.addEventListener('change', () => {
  updateEngineHelp()
  // Re-list voices for the new engine and pick its sensible default.
  loadVoices(el.ttsEngine.value === 'natural' ? 'af_heart' : '')
})

el.ttsRate.addEventListener('input', () => {
  el.rateVal.textContent = Number(el.ttsRate.value).toFixed(1)
})

el.saveKey.addEventListener('click', async () => {
  const key = el.apikey.value.trim()
  if (!key) return
  const result = await window.digitutor.setApiKey(key)
  // Never leave a pasted secret sitting in the renderer after the attempt.
  el.apikey.value = ''
  renderKeyStatus(result.status, result.ok ? undefined : result.error)
})

el.save.addEventListener('click', async () => {
  const partial: Partial<Settings> = {
    provider: el.provider.value as 'claude' | 'openai',
    model: el.model.value.trim() || DEFAULT_MODEL[el.provider.value],
    hotkey: el.hotkey.value.trim() || 'CommandOrControl+Shift+Space',
    micHotkey: el.micHotkey.value.trim() || 'CommandOrControl+Shift+M',
    launchAtStartup: el.launchAtStartup.checked,
    autoVoice: el.autoVoice.checked,
    answerDepth: el.answerDepth.value as 'deep' | 'classic',
    deepThinking: el.deepThinking.checked,
    includeResources: el.includeResources.checked,
    persona: el.persona.value,
    sttLang: el.sttLang.value,
    readAloud: el.readAloud.checked,
    ttsEngine: el.ttsEngine.value as 'natural' | 'system',
    ttsVoice: el.ttsVoice.value,
    ttsRate: Number(el.ttsRate.value)
  }
  const res = await window.digitutor.saveSettings(partial)
  el.hotkey.value = res.settings.hotkey
  if (res.hotkeyError) {
    el.saved.textContent = 'Saved, but that hotkey was rejected - kept the old one.'
  } else {
    el.saved.textContent = 'Saved ✓'
  }
  setTimeout(() => (el.saved.textContent = ''), 2600)
})

void init()
