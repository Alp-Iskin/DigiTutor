import './styles.css'
import 'katex/dist/katex.min.css'
import { renderMarkdown } from './render'
import { Stt, SttStatus } from './stt'
import { Tts, TtsState } from './tts'
import type { ApiKeyStatus, Settings, ChatMessage } from '../global'

type State = 'idle' | 'listening' | 'thinking' | 'ready'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const els = {
  status: $('status'),
  autoVoice: $<HTMLButtonElement>('auto-voice'),
  newSession: $<HTMLButtonElement>('new-session'),
  scroll: $('scroll'),
  welcome: $('welcome'),
  thread: $('thread'),
  shots: $('shots'),
  banner: $('banner'),
  composer: document.querySelector('.composer') as HTMLElement,
  bar: document.querySelector('.bar') as HTMLElement,
  footer: document.querySelector('.hint') as HTMLElement,
  input: $<HTMLTextAreaElement>('input'),
  stopRead: $<HTMLButtonElement>('stop-read'),
  mic: $<HTMLButtonElement>('mic'),
  send: $<HTMLButtonElement>('send'),
  gear: $('gear'),
  close: $('close')
}

let settings: Settings | null = null
let pending: string[] = [] // screenshots waiting to be sent with the next question
let conversation: ChatMessage[] = [] // the chat history for this session
let state: State = 'idle'
let answerText = ''
let stt: Stt | null = null
// True from when listening starts until we submit/clear; keeps accepting the
// final transcript that lands just AFTER the mic is stopped (the flushed phrase
// finishes transcribing a moment later) instead of dropping it.
let wantTranscript = false
let ttsDownloading = false
const tts = new Tts(
  (s) => applyTtsState(s),
  (pct) => {
    if (pct == null) {
      if (ttsDownloading) {
        ttsDownloading = false
        hideBanner()
      }
    } else {
      ttsDownloading = true
      showBanner(`Downloading the natural voice model… ${pct}% (one-time download)`, true)
    }
  }
)
let renderQueued = false
let streamMsgEl: HTMLElement | null = null // current assistant message wrapper
let streamContentEl: HTMLElement | null = null // streamed-into element inside it

// ---------- helpers ----------

function setState(s: State): void {
  state = s
  const labels: Record<State, string> = {
    idle: 'Ready',
    listening: 'Listening…',
    thinking: 'Thinking…',
    ready: 'Ready'
  }
  els.status.textContent = labels[s]
  els.status.className = 'status ' + (s === 'idle' ? '' : s)
  els.mic.classList.toggle('on', s === 'listening')
  els.send.textContent = s === 'thinking' ? '■' : '➤'
}

function renderAutoVoice(): void {
  const on = !!settings?.autoVoice
  els.autoVoice.classList.toggle('on', on)
  els.autoVoice.textContent = on ? '🎙 Auto' : '🎙 Off'
  els.autoVoice.title = on
    ? 'Auto-listen after screenshot is ON - click to turn off'
    : 'Auto-listen after screenshot is OFF - click to turn on (or use the 🎤 to talk)'
}

// Show the Stop-reading button whenever read-aloud is enabled in Settings.
// Grey when idle, red while actually speaking (driven by applyTtsState).
function renderReadAloud(): void {
  const on = !!settings?.readAloud
  els.stopRead.classList.toggle('hidden', !on)
}

function applyTtsState(s: TtsState): void {
  els.stopRead.classList.toggle('reading', s === 'speaking')
  els.stopRead.classList.toggle('loading', s === 'loading')
  els.stopRead.textContent = s === 'loading' ? '◌ Voice' : '◼ Stop'
  els.stopRead.title =
    s === 'speaking'
      ? 'Reading aloud - click to stop'
      : s === 'loading'
        ? 'Preparing the voice…'
        : 'Read-aloud is on; nothing is being read right now'
}

function showBanner(html: string, info = false): void {
  els.banner.innerHTML = html
  els.banner.classList.toggle('info', info)
  els.banner.classList.remove('hidden')
  measure()
}
function hideBanner(): void {
  els.banner.classList.add('hidden')
}

function showApiKeyBanner(status: ApiKeyStatus): void {
  let message = 'Add your API key to begin.'
  if (status.state === 'legacy-insecure') {
    message = 'A legacy insecure API key is disabled. Replace it securely in Settings.'
  } else if (status.state === 'locked') {
    message = 'Your encrypted API key is unavailable because secure OS storage is locked or unavailable.'
  } else if (status.state === 'unreadable') {
    message = 'Your stored API key could not be decrypted. Replace it securely in Settings.'
  } else if (!status.canStoreSecurely) {
    message = 'Secure OS key storage is unavailable, so DigiTutor will not save an API key.'
  }
  showBanner(`${message} <a id="open-settings-link">Open Settings →</a>`)
  document
    .getElementById('open-settings-link')
    ?.addEventListener('click', () => window.digitutor.openSettings())
}

function updateWelcome(): void {
  els.welcome.classList.toggle('hidden', conversation.length > 0)
}

function scrollToBottom(): void {
  els.scroll.scrollTop = els.scroll.scrollHeight
}

function measure(): void {
  const content =
    (els.banner.classList.contains('hidden') ? 0 : els.banner.offsetHeight) +
    (els.shots.classList.contains('hidden') ? 0 : els.shots.offsetHeight) +
    (els.welcome.classList.contains('hidden') ? 0 : els.welcome.offsetHeight) +
    els.thread.offsetHeight
  const h =
    els.bar.offsetHeight +
    content +
    els.composer.offsetHeight +
    els.footer.offsetHeight +
    6
  window.digitutor.resizePopup(h)
}

// Pending screenshots pinned at the top, each with an ✕ remove button.
function renderPending(): void {
  els.shots.innerHTML = ''
  if (pending.length === 0) {
    els.shots.classList.add('hidden')
    return
  }
  pending.forEach((src, i) => {
    const item = document.createElement('div')
    item.className = 'shot-item'
    const img = document.createElement('img')
    img.src = src
    img.alt = `screenshot ${i + 1}`
    const remove = document.createElement('button')
    remove.className = 'shot-remove'
    remove.title = 'Remove this screenshot'
    remove.textContent = '✕'
    remove.addEventListener('click', () => {
      pending.splice(i, 1)
      renderPending()
      measure()
    })
    item.append(img, remove)
    els.shots.appendChild(item)
  })
  els.shots.classList.remove('hidden')
}

// ---------- chat rendering ----------

function appendUserMessage(msg: ChatMessage): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'msg user'
  if (msg.images.length) {
    const imgs = document.createElement('div')
    imgs.className = 'msg-images'
    for (const src of msg.images) {
      const im = document.createElement('img')
      im.src = src
      imgs.appendChild(im)
    }
    wrap.appendChild(imgs)
  }
  const bubble = document.createElement('div')
  bubble.className = 'bubble'
  bubble.textContent = msg.text // textContent escapes user input
  wrap.appendChild(bubble)
  els.thread.appendChild(wrap)
  return wrap
}

function appendAssistantMessage(): void {
  const wrap = document.createElement('div')
  wrap.className = 'msg assistant'
  const bubble = document.createElement('div')
  bubble.className = 'bubble answer'
  bubble.innerHTML = '<span class="cursor"></span>'
  wrap.appendChild(bubble)
  els.thread.appendChild(wrap)
  streamMsgEl = wrap
  streamContentEl = bubble
}

function renderStream(): void {
  if (!streamContentEl) return
  streamContentEl.innerHTML = renderMarkdown(answerText) + '<span class="cursor"></span>'
  scrollToBottom()
  measure()
}

function queueRender(): void {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderStream()
  })
}

function autoGrow(): void {
  els.input.style.height = 'auto'
  els.input.style.height = Math.min(Math.max(els.input.scrollHeight, 64), 150) + 'px'
}

// ---------- STT ----------

function setupStt(): void {
  if (!settings) return
  stt = new Stt(settings.sttLang, {
    onTranscript: (finalText, interim) => {
      // Accept results while listening AND the brief window after a manual stop
      // (so the last flushed phrase still lands). Only drop them once we've
      // submitted/cleared (wantTranscript=false) or are mid-answer.
      if (!wantTranscript || state === 'thinking') return
      els.input.value = (finalText + interim).trimStart()
      autoGrow()
    },
    onStatus: (status: SttStatus, detail?: string) => {
      if (status === 'unavailable') {
        showBanner('Voice input isn’t available in this build - just type your question.')
      } else if (status === 'loading') {
        setState('listening')
        const pct = detail ? ` ${detail}` : ''
        showBanner(
          `Downloading the speech-to-text model…${pct} (one-time download, then it works offline)`,
          true
        )
      } else if (status === 'listening') {
        hideBanner()
      } else if (status === 'error' && detail) {
        showBanner(detail)
        if (state === 'listening') setState('idle')
      }
    }
  })
}

function startListening(): void {
  if (!stt || !stt.available) return
  wantTranscript = true
  stt.start(els.input.value ? els.input.value + ' ' : '')
  setState('listening')
}

function stopListening(): void {
  stt?.stop()
  if (state === 'listening') setState('idle')
}

// ---------- ask flow ----------

async function submit(): Promise<void> {
  if (state === 'thinking') {
    // Acting as a stop button.
    window.digitutor.cancel()
    return
  }
  const question = els.input.value.trim()
  if (!question) {
    els.input.focus()
    return
  }
  // We've captured the question; ignore any trailing transcript from the flush.
  wantTranscript = false
  stopListening()
  tts.stop()
  hideBanner()

  if (settings && !settings.model) {
    showBanner('No model configured. Open Settings to choose one.')
    return
  }

  // Capture this turn (question + the pending screenshots) into the chat.
  const userMsg: ChatMessage = { role: 'user', text: question, images: [...pending] }
  conversation.push(userMsg)
  const userEl = appendUserMessage(userMsg)
  pending = []
  renderPending()
  updateWelcome()

  els.input.value = ''
  autoGrow()

  setState('thinking')
  answerText = ''
  appendAssistantMessage()
  scrollToBottom()
  measure()

  const result = await window.digitutor.ask({ messages: conversation })

  if (result.ok) {
    answerText = result.text
    if (streamContentEl) streamContentEl.innerHTML = renderMarkdown(answerText)
    conversation.push({ role: 'assistant', text: answerText, images: [] })
    setState('ready')
    scrollToBottom()
    measure()
    if (settings?.readAloud)
      tts.speak(answerText, {
        engine: settings.ttsEngine,
        voice: settings.ttsVoice,
        rate: settings.ttsRate
      })
  } else if (result.error === 'aborted' && answerText) {
    // Keep the partial answer that streamed in before cancelling.
    if (streamContentEl) streamContentEl.innerHTML = renderMarkdown(answerText)
    conversation.push({ role: 'assistant', text: answerText, images: [] })
    setState('ready')
  } else {
    // Failed (or cancelled with nothing yet): undo this turn and restore the
    // composer so the user can retry, instead of leaving a dangling message.
    streamMsgEl?.remove()
    userEl.remove()
    conversation.pop() // remove the user turn we added
    pending = userMsg.images
    renderPending()
    els.input.value = userMsg.text
    autoGrow()
    updateWelcome()
    setState('idle')
    if (result.error === 'no-key') {
      showApiKeyBanner(await window.digitutor.getApiKeyStatus())
    } else if (result.error !== 'aborted') {
      showBanner('Error: ' + result.error)
    }
  }
  streamMsgEl = null
  streamContentEl = null
}

function newSession(): void {
  window.digitutor.cancel()
  wantTranscript = false
  stopListening()
  tts.stop()
  conversation = []
  pending = []
  answerText = ''
  streamMsgEl = null
  streamContentEl = null
  els.thread.innerHTML = ''
  renderPending()
  updateWelcome()
  hideBanner()
  els.input.value = ''
  autoGrow()
  setState('idle')
  els.input.focus()
  measure()
}

// ---------- activation ----------

function onActivate(payload: {
  screenshot: string | null
  settings: Settings
  apiKeyStatus: ApiKeyStatus
  autoListen?: boolean
}): void {
  settings = payload.settings
  if (payload.screenshot) pending.push(payload.screenshot)
  renderPending()

  if (!stt) setupStt()
  else stt.setLang(settings.sttLang)

  renderAutoVoice()
  renderReadAloud()
  // Pre-download the natural voice model so the first read-aloud isn't delayed.
  if (settings.readAloud && settings.ttsEngine === 'natural') tts.warm()
  updateWelcome()
  if (state !== 'thinking') setState('idle')
  els.input.focus()
  scrollToBottom()
  measure()

  if (payload.apiKeyStatus.state !== 'ready') showApiKeyBanner(payload.apiKeyStatus)

  // Start listening immediately for a mic-only trigger, or when Auto-voice is on
  // after a screenshot.
  if ((payload.autoListen || settings.autoVoice) && state !== 'thinking') startListening()
}

function close(): void {
  wantTranscript = false
  stopListening()
  tts.stop()
  window.digitutor.hidePopup()
}

// ---------- events ----------

window.digitutor.onActivate(onActivate)
window.digitutor.onChunk((text) => {
  if (state !== 'thinking') return
  answerText += text
  queueRender()
})
// The mic-only hotkey toggles listening: start if idle, stop if already on.
window.digitutor.onStartListen(() => {
  if (state === 'thinking') return
  if (state === 'listening') stopListening()
  else startListening()
})
window.digitutor.onAddShot(({ screenshot }) => {
  pending.push(screenshot)
  renderPending()
  measure()
  els.shots.lastElementChild?.scrollIntoView({ block: 'nearest' })
  // Each new screenshot should kick off voice again when Auto-voice is on.
  if (settings?.autoVoice && state !== 'listening' && state !== 'thinking') startListening()
})

els.send.addEventListener('click', () => void submit())
els.stopRead.addEventListener('click', () => {
  // Brief "dulled" flash on press, then state falls back to grey once stopped.
  els.stopRead.classList.add('dulled')
  setTimeout(() => els.stopRead.classList.remove('dulled'), 200)
  tts.stop()
})
els.mic.addEventListener('click', () => {
  if (state === 'listening') stopListening()
  else startListening()
})
els.autoVoice.addEventListener('click', () => {
  if (!settings) return
  settings.autoVoice = !settings.autoVoice
  renderAutoVoice()
  void window.digitutor.saveSettings({ autoVoice: settings.autoVoice })
  if (settings.autoVoice && state !== 'listening') startListening()
  else if (!settings.autoVoice && state === 'listening') stopListening()
})
els.newSession.addEventListener('click', newSession)
els.gear.addEventListener('click', () => window.digitutor.openSettings())
els.close.addEventListener('click', close)

els.input.addEventListener('input', autoGrow)
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void submit()
  } else if (e.key === 'Escape') {
    close()
  }
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close()
})

// Open answer links externally (delegated across the whole thread).
els.thread.addEventListener('click', (e) => {
  const target = e.target as HTMLElement
  const anchor = target.closest('a') as HTMLAnchorElement | null
  if (anchor && anchor.href) {
    e.preventDefault()
    window.digitutor.openLink(anchor.href)
  }
})

setState('idle')
