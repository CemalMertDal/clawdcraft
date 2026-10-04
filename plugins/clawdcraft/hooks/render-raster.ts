// The terminal's renderer: the scene drawn into a pixel buffer, two pixels
// per cell (the upper half block's foreground over its background).

import type { Scene } from './scene'
import { frameAt, sample } from './scene'
import { blend, sprite } from './sprites'
import type { Tile } from './world'

const UPPER_HALF = 0x2580

export function rasterize(scene: Scene, now: number): Uint32Array {
  const { W, H } = scene
  const buf = new Uint32Array(W * H)
  for (let y = 0; y < H; y++) {
    const c = blend(scene.skyTop, scene.skyBottom, H > 1 ? y / (H - 1) : 0)
    buf.fill(c, y * W, (y + 1) * W)
  }
  const cam = Math.floor(scene.camX)
  const drawTiles = (tiles: readonly Tile[]) => {
    for (const t of tiles) {
      const tex = sprite(t.tex)
      const x0 = Math.max(0, t.x - cam)
      const x1 = Math.min(W, t.x + t.w - cam)
      const y0 = Math.max(0, t.y)
      const y1 = Math.min(H, t.y + t.h)
      for (let y = y0; y < y1; y++) {
        const ty = (y - t.y) % tex.h
        for (let x = x0; x < x1; x++) {
          const wx = x + cam
          const c = tex.px[ty * tex.w + (((wx % tex.w) + tex.w) % tex.w)] ?? -1
          if (c >= 0) {
            buf[y * W + x] = c
          }
        }
      }
    }
  }

  let i = 0
  const actors = scene.actors
  const drawActorsBelow = (z: number) => {
    for (; i < actors.length && (actors[i]?.z ?? 0) < z; i++) {
      const a = actors[i]
      if (!a) {
        continue
      }
      const m = sample(a.motion, now)
      if (m.o < 0.5) {
        continue
      }
      const ox = Math.round((a.space === 'world' ? a.x - cam : a.x) + m.x)
      const oy = Math.round(a.y + m.y)
      if (a.rect) {
        const x1 = Math.min(W, ox + a.rect.w)
        const y1 = Math.min(H, oy + a.rect.h)
        for (let y = Math.max(0, oy); y < y1; y++) {
          for (let x = Math.max(0, ox); x < x1; x++) {
            buf[y * W + x] = a.rect.color
          }
        }
        continue
      }
      const name = frameAt(a, now)
      if (!name) {
        continue
      }
      const s = sprite(name)
      for (let sy = 0; sy < s.h; sy++) {
        const y = oy + sy
        if (y < 0 || y >= H) {
          continue
        }
        for (let sx = 0; sx < s.w; sx++) {
          const x = ox + sx
          if (x < 0 || x >= W) {
            continue
          }
          const c = s.px[sy * s.w + (a.flip ? s.w - 1 - sx : sx)] ?? -1
          if (c >= 0) {
            buf[y * W + x] = c
          }
        }
      }
    }
  }

  drawActorsBelow(10)
  drawTiles(scene.tiles)
  drawTiles(scene.structures)
  drawActorsBelow(Number.POSITIVE_INFINITY)

  return buf
}

/** Packs a buffer `columns` wide and `rows * 2` tall as a Raster's `cells`. */
export function packCells(buf: Uint32Array, W: number, H: number, columns: number, rows: number): string {
  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++) {
    const top = 2 * r
    const bottom = Math.min(H - 1, top + 1)
    for (let c = 0; c < columns; c++) {
      const n = (r * columns + c) * 3
      const x = Math.min(W - 1, c)
      words[n] = UPPER_HALF
      words[n + 1] = buf[top * W + x] ?? 0
      words[n + 2] = buf[bottom * W + x] ?? 0
    }
  }

  return base64(new Uint8Array(words.buffer))
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(bytes: Uint8Array): string {
  const native = (bytes as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === 'function') {
    return native.call(bytes)
  }
  const parts: string[] = []
  let chunk = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    chunk +=
      ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]! + ALPHABET[(n >> 6) & 63]! + ALPHABET[n & 63]!
    if (chunk.length > 8192) {
      parts.push(chunk)
      chunk = ''
    }
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16
    chunk += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}==`
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8)
    chunk += `${ALPHABET[(n >> 18) & 63]}${ALPHABET[(n >> 12) & 63]}${ALPHABET[(n >> 6) & 63]}=`
  }
  parts.push(chunk)

  return parts.join('')
}
