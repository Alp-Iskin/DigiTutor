// Text-to-speech with two engines:
//   • 'natural' - Kokoro, a neural voice that sounds close to commercial voice
//     assistants, generated locally in a Web Worker (see kokoro.worker.ts).
//   • 'system'  - the built-in Chromium Speech Synthesis voices (robotic, but
//     instant and a safe fallback if the Kokoro model can't load).
import KokoroWorker from './kokoro.worker?worker'

export type TtsEngine = 'natural' | 'system'
export type TtsState = 'idle' | 'loading' | 'speaking'

export function listVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis ? window.speechSynthesis.getVoices() : []
}

// Strip Markdown / LaTeX so the spoken version sounds natural. Crucially, this
// keeps sentence punctuation and gives every block (heading, list item,
// paragraph) its own terminator, so the TTS chunker has clean boundaries to
// split on instead of one giant run-on line that gets clipped.
function plainText(markdown: string): string {
  const t = markdown
    .replace(/```[\s\S]*?```/g, '. code block. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1. ')
    .replace(/\$([^$]*)\$/g, ' $1 ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → just the text
    .replace(/https?:\/\/\S+/g, '') // never read bare URLs aloud

  const parts: string[] = []
  for (let line of t.split(/\r?\n/)) {
    line = line
      .replace(/^\s*#{1,6}\s*/, '') // heading markers
      .replace(/^\s*[-*+]\s+/, '') // bullet markers
      .replace(/^\s*\d+[.)]\s+/, '') // numbered-list markers
      .replace(/^\s*>\s?/, '') // blockquotes
      .replace(/[*_~|>#]/g, ' ') // leftover emphasis/markup
      .replace(/\s+/g, ' ')
      .trim()
    if (!line) continue
    if (!/[.!?:,;]$/.test(line)) line += '.' // ensure a sentence boundary
    parts.push(line)
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export interface SpeakOptions {
  engine: TtsEngine
  voice: string
  rate: number
}

// One shared instance owns the Kokoro worker and audio playback so we can start,
// stop, and report state ('loading' → 'speaking' → 'idle') from the UI.
export class Tts {
  private worker: Worker | null = null
  private ctx: AudioContext | null = null
  private reqId = 0 // id of the active request; stale worker messages are ignored
  // We BUFFER all generated chunks and play them as one continuous source once
  // generation finishes. Streaming each chunk as it arrives produced choppy
  // multi-second gaps whenever generation lagged playback; concatenating first
  // guarantees gapless audio at the cost of a short upfront "preparing" wait.
  private bufferedChunks: Float32Array[] = []
  private bufferedRate = 24000
  private current: AudioBufferSourceNode | null = null
  private utterance: SpeechSynthesisUtterance | null = null

  constructor(
    private onState: (state: TtsState) => void,
    // pct (0-100) while the voice model downloads; null once it's ready/loaded.
    private onProgress?: (pct: number | null) => void
  ) {}

  private setState(s: TtsState): void {
    this.onState(s)
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker
    try {
      this.worker = new KokoroWorker()
      this.worker.onmessage = (e) => this.onWorker(e.data)
      this.worker.postMessage({ type: 'load' }) // warm up so first use is fast
    } catch {
      this.worker = null
    }
    return this.worker
  }

  // Pre-download the model in the background (called when read-aloud is on).
  warm(): void {
    this.ensureWorker()
  }

  speak(markdown: string, opts: SpeakOptions): void {
    this.stop()
    const text = plainText(markdown)
    if (!text) return
    if (opts.engine === 'system') {
      this.speakSystem(text, opts)
      return
    }
    const worker = this.ensureWorker()
    if (!worker) {
      // Worker couldn't start - fall back to the system voice.
      this.speakSystem(text, opts)
      return
    }
    const id = ++this.reqId
    this.bufferedChunks = []
    this.setState('loading')
    worker.postMessage({ type: 'speak', id, text, voice: opts.voice, speed: opts.rate })
  }

  private speakSystem(text: string, opts: SpeakOptions): void {
    if (!window.speechSynthesis) {
      this.setState('idle')
      return
    }
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = opts.rate
    const voice = listVoices().find((v) => v.name === opts.voice)
    if (voice) utter.voice = voice
    utter.onstart = () => this.setState('speaking')
    utter.onend = () => {
      if (this.utterance === utter) this.setState('idle')
    }
    utter.onerror = () => {
      if (this.utterance === utter) this.setState('idle')
    }
    this.utterance = utter
    this.setState('speaking')
    window.speechSynthesis.speak(utter)
  }

  private onWorker(msg: {
    type: string
    id?: number
    audio?: Float32Array
    rate?: number
    error?: string
    device?: string
    data?: { status?: string; progress?: number }
  }): void {
    if (msg.type === 'progress') {
      const d = msg.data
      if (d?.status === 'progress' && typeof d.progress === 'number') {
        this.onProgress?.(Math.round(d.progress))
      }
      return
    }
    if (msg.type === 'ready') {
      console.info('[DigiTutor TTS] Kokoro running on:', msg.device ?? 'unknown')
      this.onProgress?.(null)
      return
    }
    if (msg.type === 'chunk' && msg.id === this.reqId && msg.audio && msg.rate) {
      this.onProgress?.(null) // model is clearly loaded once audio arrives
      this.bufferedChunks.push(msg.audio)
      this.bufferedRate = msg.rate
    } else if (msg.type === 'done' && msg.id === this.reqId) {
      this.onProgress?.(null)
      this.playBuffered()
    } else if (msg.type === 'error') {
      // Loading/generation failed - give up gracefully (UI returns to idle).
      console.warn('[DigiTutor TTS] Kokoro error:', msg.error)
      this.onProgress?.(null)
      this.setState('idle')
    }
  }

  // Concatenate every generated chunk and play it as a single gapless source.
  private playBuffered(): void {
    const chunks = this.bufferedChunks
    this.bufferedChunks = []
    const total = chunks.reduce((n, c) => n + c.length, 0)
    if (total === 0) {
      this.setState('idle')
      return
    }
    if (!this.ctx || this.ctx.state === 'closed') this.ctx = new AudioContext()
    const ctx = this.ctx
    const buffer = ctx.createBuffer(1, total, this.bufferedRate)
    const channel = buffer.getChannelData(0)
    let offset = 0
    for (const c of chunks) {
      channel.set(c, offset)
      offset += c.length
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    const myId = this.reqId
    source.onended = () => {
      if (this.current === source) {
        this.current = null
        if (myId === this.reqId) this.setState('idle')
      }
    }
    this.current = source
    this.setState('speaking')
    source.start()
  }

  stop(): void {
    // Invalidate the current request so late chunks/done are ignored.
    this.reqId++
    this.bufferedChunks = []
    this.worker?.postMessage({ type: 'stop' })
    if (this.current) {
      try {
        this.current.stop()
      } catch {
        /* already stopped */
      }
      this.current = null
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    this.utterance = null
    this.setState('idle')
  }
}
