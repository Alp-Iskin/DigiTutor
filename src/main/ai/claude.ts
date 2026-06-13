import Anthropic from '@anthropic-ai/sdk'
import { AskParams, AskResult, parseDataUrl } from './types'

// Streams an answer from Claude, with the screenshot attached as a vision block.
export async function askClaude(params: AskParams): Promise<AskResult> {
  const client = new Anthropic({ apiKey: params.apiKey })

  const messages: Anthropic.MessageParam[] = params.messages.map((m) => {
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.text }
    }
    const content: Anthropic.ContentBlockParam[] = []
    for (const shot of m.images) {
      const { mediaType, data } = parseDataUrl(shot)
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/webp',
          data
        }
      })
    }
    content.push({ type: 'text', text: m.text })
    return { role: 'user', content }
  })

  const body: Anthropic.MessageStreamParams = {
    model: params.model,
    max_tokens: 16000,
    system: params.system,
    messages
  }
  if (params.deepThinking) {
    // Adaptive thinking improves accuracy on math/science (Opus 4.6+).
    ;(body as Record<string, unknown>).thinking = { type: 'adaptive' }
  }

  const stream = client.messages.stream(body, { signal: params.signal })
  stream.on('text', (t) => params.onText(t))

  const final = await stream.finalMessage()
  const text = final.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return { text }
}
