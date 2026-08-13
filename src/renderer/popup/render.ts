import { marked } from 'marked'
import DOMPurify from 'dompurify'
import katex from 'katex'

marked.setOptions({ breaks: true, gfm: true })

// Render $...$ and $$...$$ as KaTeX, protecting them from the Markdown parser.
function renderMath(src: string): { text: string; placeholders: Map<string, string> } {
  const placeholders = new Map<string, string>()
  let n = 0
  const stash = (tex: string, display: boolean): string => {
    const key = `@@KX${n++}@@`
    try {
      placeholders.set(
        key,
        katex.renderToString(tex, { displayMode: display, throwOnError: false })
      )
    } catch {
      placeholders.set(key, tex)
    }
    return key
  }
  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, t) => stash(t, true))
  text = text.replace(/(?<!\\)\$([^\n$]+?)\$/g, (_m, t) => stash(t, false))
  return { text, placeholders }
}

export function renderMarkdown(src: string): string {
  const { text, placeholders } = renderMath(src)
  let html = marked.parse(text) as string
  for (const [key, value] of placeholders) {
    html = html.split(key).join(value)
  }
  return DOMPurify.sanitize(html, {
    ADD_TAGS: [
      'math',
      'semantics',
      'mrow',
      'mi',
      'mo',
      'mn',
      'msup',
      'msub',
      'mfrac',
      'msqrt',
      'annotation',
      'span',
      'svg',
      'path'
    ],
    ADD_ATTR: ['xmlns', 'class', 'style', 'd', 'viewBox', 'aria-hidden']
  })
}
