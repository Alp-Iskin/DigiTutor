/// <reference lib="webworker" />
declare const self: DedicatedWorkerGlobalScope

// Natural-sounding text-to-speech off the UI thread via Kokoro (kokoro-js).
// Kokoro is an 82M-parameter neural TTS that sounds close to commercial voice
// assistants while running fully in-browser (ONNX). The model downloads once
// (cached) and then generates locally - no API key, portable to a website.
//
// We use the *web* build of kokoro-js (aliased in electron.vite.config.ts);
// the default build imports node's fs/path. The web build is self-contained
// (transformers + phonemizer + onnxruntime-web are inlined).
import { KokoroTTS } from 'kokoro-js'

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX'

// Keep each generated chunk well under Kokoro's phoneme limit. Long run-on
// "sentences" (e.g. a bullet list flattened to one line) otherwise get clipped
// or dropped - that was the cause of audio cutting out partway through.
const MAX_CHUNK_CHARS = 240

let tts: KokoroTTS | null = null
let loading: Promise<KokoroTTS> | null = null
// The main thread assigns each speak request an id and echoes it on chunks so it
// can drop stale audio. A `stop` (or a newer request) changes `genId`, so the
// running loop's id no longer matches and it exits at the next chunk boundary.
let genId = -1

async function getTTS(): Promise<KokoroTTS> {
  if (tts) return tts
  if (!loading) {
    loading = (async () => {
      // Prefer WebGPU: generation is far faster than real time, which keeps the
      // playback gapless. Fall back to WASM (slower, but works everywhere).
      let device: 'webgpu' | 'wasm' = 'wasm'
      try {
        if ((navigator as unknown as { gpu?: unknown }).gpu) device = 'webgpu'
      } catch {
        /* no webgpu */
      }
      // fp16 is fast + good quality on WebGPU; q8 is the reliable small WASM build.
      const build = (d: 'webgpu' | 'wasm') =>
        KokoroTTS.from_pretrained(MODEL, {
          dtype: d === 'webgpu' ? 'fp16' : 'q8',
          device: d,
          progress_callback: (p: unknown) => self.postMessage({ type: 'progress', data: p })
        })

      let model: KokoroTTS
      try {
        model = await build(device)
      } catch (err) {
        if (device === 'webgpu') {
          device = 'wasm'
          model = await build('wasm')
        } else {
          throw err
        }
      }
      tts = model
      // Report the backend actually used - WebGPU is fast enough to keep up,
      // WASM is the slow fallback (longer "preparing" wait before playback).
      self.postMessage({ type: 'ready', device })
      return model
    })()
  }
  return loading
}

// Split text into chunks that each end on natural punctuation and stay short
// enough for Kokoro to render in full.
function chunkText(text: string): string[] {
  // Break into sentences (keep the terminator), then split anything still too
  // long on clause punctuation, and finally hard-wrap as a last resort.
  const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [text]
  const out: string[] = []
  let buf = ''
  const push = (s: string) => {
    const t = s.trim()
    if (t) out.push(t)
  }
  for (const sentence of sentences) {
    let s = sentence.trim()
    if (!s) continue
    while (s.length > MAX_CHUNK_CHARS) {
      // Find a clause break before the limit; else hard-cut at the limit.
      const window = s.slice(0, MAX_CHUNK_CHARS)
      let cut = Math.max(
        window.lastIndexOf(', '),
        window.lastIndexOf('; '),
        window.lastIndexOf(': '),
        window.lastIndexOf(' - '),
        window.lastIndexOf(') ')
      )
      if (cut < MAX_CHUNK_CHARS * 0.5) cut = window.lastIndexOf(' ')
      if (cut <= 0) cut = MAX_CHUNK_CHARS
      push(buf)
      buf = ''
      push(s.slice(0, cut + 1))
      s = s.slice(cut + 1).trim()
    }
    if ((buf + ' ' + s).trim().length > MAX_CHUNK_CHARS) {
      push(buf)
      buf = s
    } else {
      buf = (buf + ' ' + s).trim()
    }
  }
  push(buf)
  return out
}

// Kokoro pads each generated clip with silence; back-to-back that becomes an
// over-long gap at chunk joins. Trim near-silent edges, leaving a small pad so
// the join still sounds natural.
function trimSilence(audio: Float32Array, rate: number): Float32Array {
  const thresh = 0.01
  let start = 0
  let end = audio.length
  while (start < end && Math.abs(audio[start]) < thresh) start++
  while (end > start && Math.abs(audio[end - 1]) < thresh) end--
  if (start >= end) return audio // all quiet - leave it alone
  const pad = Math.floor(0.04 * rate) // ~40 ms
  start = Math.max(0, start - pad)
  end = Math.min(audio.length, end + pad)
  return audio.subarray(start, end)
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data
  if (msg.type === 'load') {
    getTTS().catch((err) =>
      self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    )
    return
  }
  if (msg.type === 'stop') {
    genId = -1
    return
  }
  if (msg.type === 'speak') {
    const myId = msg.id as number
    genId = myId
    try {
      const model = await getTTS()
      if (myId !== genId) return // superseded while the model was loading
      const chunks = chunkText(msg.text as string)
      let produced = false
      for (const chunk of chunks) {
        if (myId !== genId) break // stopped or superseded
        try {
          const audio = await model.generate(chunk, {
            voice: (msg.voice as never) || ('af_heart' as never),
            speed: typeof msg.speed === 'number' ? msg.speed : 1
          })
          if (myId !== genId) break
          const rate = audio.sampling_rate as number
          const copy = new Float32Array(trimSilence(audio.audio as Float32Array, rate))
          self.postMessage({ type: 'chunk', id: myId, audio: copy, rate }, [copy.buffer])
          produced = true
        } catch (chunkErr) {
          // Skip a chunk that fails to phonemize/generate rather than aborting
          // the whole answer - the rest still gets read.
          console.warn('[DigiTutor TTS] skipped a chunk:', chunkErr)
        }
      }
      if (myId === genId) self.postMessage({ type: 'done', id: myId, produced })
    } catch (err) {
      if (myId === genId) {
        self.postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) })
      }
    }
  }
}
