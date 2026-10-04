// The terminal's renderer: the scene drawn into a pixel buffer, shrunk 2:1
// so it sits about as large as the desktop's, then two pixels per cell (the
// upper half block's foreground over its background).

import type { Scene } from './scene'
import { frameAt, sample } from './scene'
import { blend, sprite } from './sprites'
import type { Tile } from './world'

const UPPER_HALF = 0x2580

export type RasterOptions = {
  /** Multiplies the ground's colors (grass, dirt, trees, plants): below 1 darkens them. */
  groundShade?: number
  /** Filled with 1 where something was drawn over the sky, for `downsample2`. */
  mask?: Uint8Array
}

export function rasterize(scene: Scene, now: number, opts: RasterOptions = {}): Uint32Array {
  const { W, H } = scene
  const buf = new Uint32Array(W * H)
  for (let y = 0; y < H; y++) {
    const c = blend(scene.skyTop, scene.skyBottom, H > 1 ? y / (H - 1) : 0)
    buf.fill(c, y * W, (y + 1) * W)
  }
  const mask = opts.mask
  const shade = opts.groundShade ?? 1
  const ground = (c: number) => (shade === 1 ? c : blend(c, 0x000000, 1 - shade))
  const put = (i: number, c: number) => {
    buf[i] = c
    if (mask) {
      mask[i] = 1
    }
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
            put(y * W + x, ground(c))
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
            put(y * W + x, a.rect.color)
          }
        }
        continue
      }
      const name = frameAt(a, now)
      if (!name) {
        continue
      }
      const s = sprite(name)
      const tint = a.isGround ? ground : (c: number) => c
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
            put(y * W + x, tint(c))
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

const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11

/**
 * Halves a buffer each way. Each 2x2 block keeps what was drawn over the
 * sky if anything was, so thin things (a fishing line, a star) survive;
 * among those its most common color, and on a tie the darker one, so an
 * eye beside a cheek stays an eye.
 */
export function downsample2(buf: Uint32Array, mask: Uint8Array, W: number, H: number): Uint32Array {
  const w = W >> 1
  const h = H >> 1
  const out = new Uint32Array(w * h)
  const picks: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 2 * y * W + 2 * x
      const block = [i, i + 1, i + W, i + W + 1]
      const drawn = block.filter(j => mask[j] === 1)
      const from = drawn.length > 0 ? drawn : block
      picks.length = 0
      for (const j of from) {
        picks.push(buf[j] ?? 0)
      }
      let best = picks[0] ?? 0
      let bestCount = 0
      for (const c of picks) {
        let count = 0
        for (const d of picks) {
          if (d === c) {
            count++
          }
        }
        if (count > bestCount || (count === bestCount && luma(c) < luma(best))) {
          best = c
          bestCount = count
        }
      }
      out[y * w + x] = drawn.length > 0 ? best : (buf[i] ?? 0)
    }
  }

  return out
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
