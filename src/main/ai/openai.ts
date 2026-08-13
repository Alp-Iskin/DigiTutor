import { AskParams, AskResult } from './types'

// Minimal OpenAI Chat Completions streaming via fetch (no SDK dependency).
// Lets the app stay provider-swappable; Claude is the recommended default.
export async function askOpenAI(params: AskParams): Promise<AskResult> {
  const messages: unknown[] = [{ role: 'system', content: params.system }]
  for (const m of params.messages) {
    if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.text })
      continue
    }
    const userContent: unknown[] = []
    for (const shot of m.images) {
      userContent.push({ type: 'image_url', image_url: { url: shot } })
    }
    userContent.push({ type: 'text', text: m.text })
    messages.push({ role: 'user', content: userContent })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      max_completion_tokens: 16000,
      messages
    })
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${detail.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice('data:'.length).trim()
      if (payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta: string = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          params.onText(delta)
        }
      } catch {
        // Ignore keep-alive / partial frames.
      }
    }
  }

  return { text: full }
}
