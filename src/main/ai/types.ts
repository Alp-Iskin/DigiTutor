export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  /** PNG/JPEG data URLs attached to this message (user turns). */
  images: string[]
}

export interface AskParams {
  apiKey: string
  model: string
  system: string
  /** Full conversation so far; the last entry is the new user question. */
  messages: ChatMessage[]
  deepThinking: boolean
  /** Called for each streamed text chunk. */
  onText: (text: string) => void
  signal: AbortSignal
}

export interface AskResult {
  text: string
}

export type Provider = (params: AskParams) => Promise<AskResult>

export function parseDataUrl(dataUrl: string): {
  mediaType: string
  data: string
} {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Unsupported image data URL')
  return { mediaType: match[1], data: match[2] }
}
