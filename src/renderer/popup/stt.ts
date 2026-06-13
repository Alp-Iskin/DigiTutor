// Speech-to-text using a local Whisper model (transformers.js) in a Web Worker.
//
// Captures mic audio at 16 kHz mono and splits it into phrases on natural
// pauses (silence detection). Each finished phrase is transcribed once and
// APPENDED to the text — so passes stay short/fast (no re-processing the whole
// utterance), text lands right after each pause, and earlier words don't churn.
//
// Replaces the Web Speech API, which doesn't work in Electron. Whisper is free,
// offline-capable, and portable to a website.
import WhisperWorker from './whisper.worker?worker'

export type SttStatus = 'unavailable' | 'idle' | 'listening' | 'loading' | 'error'

export interface SttCallbacks {
  onTranscript: (finalText: string, interimText: string) => void
  onStatus: (status: SttStatus, detail?: string) => void
}

const SAMPLE_RATE = 16000
const SILENCE_RMS = 0.008 // below this counts as silence
const SILENCE_HOLD = Math.floor(0.7 * SAMPLE_RATE) // pause length that ends a phrase
const MIN_SEGMENT = Math.floor(0.8 * SAMPLE_RATE) // don't cut phrases shorter than this
const MAX_SEGMENT = Math.floor(14 * SAMPLE_RATE) // force a cut on very long speech

export class Stt {
  private worker: Worker | null = null
  private stream: MediaStream | null = null
  private audioCtx: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null

  private seg: Float32Array[] = []
  private segLen = 0
  private silence = 0
  private hasSpeech = false

  private committed = '' // text confirmed so far (includes the seed)
  private active = false
  private modelReady = false
  private lang: string

  constructor(
    lang: string,
    private cb: SttCallbacks
  ) {
    this.lang = lang
    if (!navigator.mediaDevices?.getUserMedia || typeof Worker === 'undefined') {
      this.cb.onStatus('unavailable')
      return
    }
    let worker: Worker
    try {
      worker = new WhisperWorker()
    } catch {
      this.cb.onStatus('unavailable')
      return
    }
    this.worker = worker
    worker.onmessage = (e) => this.onWorker(e.data)
    // Warm up the model in the background so the first use is fast.
    worker.postMessage({ type: 'load' })
  }

  get available(): boolean {
    return this.worker !== null
  }

  setLang(lang: string): void {
    this.lang = lang
  }

  private langCode(): string {
    return (this.lang || 'en').slice(0, 2).toLowerCase()
  }

  private onWorker(msg: {
    type: string
    text?: string
    device?: string
    error?: string
    data?: { status?: string; progress?: number }
  }): void {
    if (msg.type === 'ready') {
      this.modelReady = true
      console.info('[DigiTutor voice] model ready, running on:', msg.device ?? 'unknown')
      if (this.active) this.cb.onStatus('listening')
    } else if (msg.type === 'progress') {
      const d = msg.data
      if (this.active && !this.modelReady && d?.status === 'progress' && typeof d.progress === 'number') {
        this.cb.onStatus('loading', `${Math.round(d.progress)}%`)
      }
    } else if (msg.type === 'result') {
      const piece = (msg.text ?? '').trim()
      if (piece) {
        this.committed = (this.committed + ' ' + piece).replace(/\s+/g, ' ').trimStart()
      }
      this.cb.onTranscript(this.committed, '')
    } else if (msg.type === 'error') {
      this.cb.onStatus('error', 'Voice error: ' + (msg.error ?? 'unknown'))
    }
  }

  async start(seed = ''): Promise<void> {
    if (!this.worker) {
      this.cb.onStatus('unavailable')
      return
    }
    this.committed = seed
    this.seg = []
    this.segLen = 0
    this.silence = 0
    this.hasSpeech = false
    this.active = true
    this.cb.onStatus(this.modelReady ? 'listening' : 'loading')
    if (!this.modelReady) this.worker.postMessage({ type: 'load' })

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      })
    } catch {
      this.active = false
      this.cb.onStatus('error', 'Microphone access denied — check Windows mic permissions.')
      return
    }

    this.audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.source = this.audioCtx.createMediaStreamSource(this.stream)
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (ev) => this.onAudio(ev.inputBuffer.getChannelData(0))
    this.source.connect(this.processor)
    // Output stays silent; connecting keeps the processor running.
    this.processor.connect(this.audioCtx.destination)
  }

  private onAudio(data: Float32Array): void {
    if (!this.active) return
    // RMS energy of this block.
    let sum = 0
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
    const rms = Math.sqrt(sum / data.length)

    this.seg.push(new Float32Array(data))
    this.segLen += data.length
    if (rms > SILENCE_RMS) {
      this.hasSpeech = true
      this.silence = 0
    } else {
      this.silence += data.length
    }

    const endedPhrase = this.hasSpeech && this.segLen >= MIN_SEGMENT && this.silence >= SILENCE_HOLD
    if (endedPhrase || this.segLen >= MAX_SEGMENT) this.emitSegment()
  }

  // Send the current phrase to the worker (only if it actually contains speech).
  private emitSegment(): void {
    if (!this.worker || this.segLen === 0) return
    if (this.hasSpeech) {
      const audio = new Float32Array(this.segLen)
      let offset = 0
      for (const c of this.seg) {
        audio.set(c, offset)
        offset += c.length
      }
      this.worker.postMessage(
        { type: 'transcribe', audio, language: this.langCode() },
        [audio.buffer]
      )
    }
    this.seg = []
    this.segLen = 0
    this.silence = 0
    this.hasSpeech = false
  }

  async stop(): Promise<void> {
    if (!this.active) {
      this.cb.onStatus('idle')
      return
    }
    this.active = false
    this.emitSegment() // flush the trailing phrase
    this.cleanupAudio()
    this.cb.onStatus('idle')
  }

  private cleanupAudio(): void {
    try {
      this.processor?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      this.source?.disconnect()
    } catch {
      /* ignore */
    }
    try {
      void this.audioCtx?.close()
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.processor = null
    this.source = null
    this.audioCtx = null
    this.stream = null
  }
}
