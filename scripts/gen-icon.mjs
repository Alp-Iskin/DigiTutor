// Generates build/icon.ico (and icon.png) from DigiTutor's brand design at
// build time, so the repo ships no committed binary assets. Mirrors the
// rounded-square gradient drawn in src/main/icon.ts.
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BRAND = { r: 0x4f, g: 0x7c, b: 0xff }

// Draw an RGBA buffer for the rounded-square brand glyph.
function draw(size) {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.46
  const corner = size * 0.28
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const dx = Math.abs(x + 0.5 - cx)
      const dy = Math.abs(y + 0.5 - cy)
      const half = radius
      let inside
      if (dx <= half - corner || dy <= half - corner) {
        inside = dx <= half && dy <= half
      } else {
        const rx = dx - (half - corner)
        const ry = dy - (half - corner)
        inside = rx * rx + ry * ry <= corner * corner
      }
      if (inside) {
        const t = (x + y) / (size * 2)
        const lift = 0.15 + 0.5 * Math.max(0, 1 - Math.abs(t - 0.35) * 3)
        buf[i + 0] = Math.min(255, BRAND.r + lift * 90)
        buf[i + 1] = Math.min(255, BRAND.g + lift * 90)
        buf[i + 2] = Math.min(255, BRAND.b + lift * 60)
        buf[i + 3] = 255
      } else {
        buf[i + 0] = 0
        buf[i + 1] = 0
        buf[i + 2] = 0
        buf[i + 3] = 0
      }
    }
  }
  return buf
}

// ---- minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  // rows with filter byte 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

// ---- ICO container (PNG-compressed entries) ----
function encodeIco(pngs) {
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(count, 4)
  const entries = []
  let offset = 6 + count * 16
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16)
    e[0] = size >= 256 ? 0 : size
    e[1] = size >= 256 ? 0 : size
    e[2] = 0
    e[3] = 0
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bit count
    e.writeUInt32LE(data.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += data.length
    entries.push(e)
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'build')
mkdirSync(outDir, { recursive: true })

const sizes = [16, 32, 48, 64, 128, 256]
const pngs = sizes.map((size) => ({ size, data: encodePng(draw(size), size) }))

writeFileSync(resolve(outDir, 'icon.png'), pngs[pngs.length - 1].data) // 256px PNG
writeFileSync(resolve(outDir, 'icon.ico'), encodeIco(pngs))
console.log('Wrote build/icon.ico and build/icon.png')
