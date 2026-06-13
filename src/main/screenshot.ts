import { desktopCapturer, screen } from 'electron'

const MAX_EDGE = 1600 // cap longest edge to control upload size / token cost

// Capture the display the cursor is currently on, returned as a PNG data URL.
export async function captureScreen(): Promise<string> {
  const point = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(point)
  const scale = display.scaleFactor || 1
  const fullW = Math.round(display.size.width * scale)
  const fullH = Math.round(display.size.height * scale)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: fullW, height: fullH }
  })

  const source =
    sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
  if (!source) throw new Error('No screen source available')

  let image = source.thumbnail
  const { width, height } = image.getSize()
  const longest = Math.max(width, height)
  if (longest > MAX_EDGE) {
    const factor = MAX_EDGE / longest
    image = image.resize({
      width: Math.round(width * factor),
      height: Math.round(height * factor),
      quality: 'good'
    })
  }

  return image.toDataURL()
}
