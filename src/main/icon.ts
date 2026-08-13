import { nativeImage, NativeImage } from 'electron'

// Generate icons at runtime so the project ships with no binary assets.
// Draws a rounded-square "spark" glyph in DigiTutor's brand blue onto a
// premultiplied BGRA buffer, which Electron accepts directly.

const BRAND = { r: 0x4f, g: 0x7c, b: 0xff }

function makeIcon(size: number): NativeImage {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.46
  const corner = size * 0.28

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      // Rounded-square mask.
      const dx = Math.abs(x + 0.5 - cx)
      const dy = Math.abs(y + 0.5 - cy)
      const half = radius
      let inside: boolean
      if (dx <= half - corner || dy <= half - corner) {
        inside = dx <= half && dy <= half
      } else {
        const rx = dx - (half - corner)
        const ry = dy - (half - corner)
        inside = rx * rx + ry * ry <= corner * corner
      }

      if (inside) {
        // A lighter diagonal "spark" highlight across the glyph.
        const t = (x + y) / (size * 2)
        const lift = 0.15 + 0.5 * Math.max(0, 1 - Math.abs(t - 0.35) * 3)
        const r = Math.min(255, BRAND.r + lift * 90)
        const g = Math.min(255, BRAND.g + lift * 90)
        const b = Math.min(255, BRAND.b + lift * 60)
        buf[i + 0] = b // B
        buf[i + 1] = g // G
        buf[i + 2] = r // R
        buf[i + 3] = 255 // A
      } else {
        buf[i + 0] = 0
        buf[i + 1] = 0
        buf[i + 2] = 0
        buf[i + 3] = 0
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size })
}

export function trayIcon(): NativeImage {
  return makeIcon(32)
}

export function appIcon(): NativeImage {
  return makeIcon(256)
}
