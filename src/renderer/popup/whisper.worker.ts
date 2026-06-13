/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

// Runs Whisper speech-to-text off the UI thread via transformers.js.
// The model is downloaded once (cached by the browser/Electron) and then runs
// fully locally - no API key, works offline, and is portable to a website.
import { pipeline, env } from '@huggingface/transformers'

// Always fetch the model from the Hugging Face hub (cached after first use).
env.allowLocalModels = false

// "small" handles technical/jargon speech far better than base, stays
// multilingual, and is still light enough to run in-browser (and on a website).
const MODEL = 'onnx-community/whisper-small'

type Transcriber = (
  audio: Float32Array,
  opts: Record<string, unknown>
) => Promise<{ text: string } | Array<{ text: string }>>

let transcriber: Transcriber | null = null
let loading: Promise<Transcriber> | null = null

async function getTranscriber(): Promise<Transcriber> {
  if (transcriber) return transcriber
  if (!loading) {
    loading = (async () => {
      // Prefer WebGPU for speed; fall back to WASM if it's unavailable/fails.
      let device: 'webgpu' | 'wasm' = 'wasm'
      try {
        if ((navigator as unknown as { gpu?: unknown }).gpu) device = 'webgpu'
      } catch {
        /* no webgpu */
      }
      const build = (d: 'webgpu' | 'wasm') =>
        pipeline('automatic-speech-recognition', MODEL, {
          device: d,
          progress_callback: (p: unknown) => self.postMessage({ type: 'progress', data: p })
        }) as unknown as Promise<Transcriber>

      let pipe: Transcriber
      try {
        pipe = await build(device)
      } catch (err) {
        if (device === 'webgpu') {
          device = 'wasm'
          pipe = await build('wasm')
        } else {
          throw err
        }
      }
      transcriber = pipe
      self.postMessage({ type: 'ready', device })
      return pipe
    })()
  }
  return loading
}

// Transcription jobs must run strictly one-at-a-time in arrival order. The model
// can't be invoked concurrently, and - more importantly - if two phrases were
// processed in parallel, whichever finished first would post first, reordering
// the user's sentences (a short trailing phrase beating a longer earlier one).
// This promise chain serializes them so the transcript stays in spoken order.
let queue: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'load') {
    getTranscriber().catch((err) =>
      self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    )
    return
  }
  if (msg.type === 'transcribe') {
    queue = queue.then(async () => {
      try {
        const t = await getTranscriber()
        const out = await t(msg.audio as Float32Array, {
          language: msg.language,
          task: 'transcribe'
        })
        const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text
        self.postMessage({ type: 'result', text })
      } catch (err) {
        self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    })
  }
}
