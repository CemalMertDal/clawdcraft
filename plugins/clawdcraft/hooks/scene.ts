import type { ActivityKind, MarkKind, WorldState } from '../types'
import type { SpriteName } from './sprites'
import { blend, sprite } from './sprites'
import type { Biome, Tile } from './world'
import {
  BLOCK,
  BOOM_MS,
  EFFECT_MS,
  biomeAt,
  buildTerrain,
  cameraAt,
  colOf,
  dayTimeAt,
  groundFn,
  hash,
  layoutFor,
  markIndex,
  nightness,
  posAt,
} from './world'

/** One keyframe: at phase `p`, offset by `x`, `y`, at opacity `o`. */
export type Key = { p: number; x: number; y: number; o: number }

/** Keyframes over `dur` ms from `start` (epoch ms), once or looping. */
export type Motion = { keys: Key[]; dur: number; start: number; loop: boolean }

/**
 * Something drawn: a sprite (cycling `frames` at `fps`) or a plain `rect`,
 * in world pixels or screen pixels, moved by `motion`.
 */
export type Actor = {
  space: 'world' | 'screen'
  x: number
  y: number
  frames?: SpriteName[]
  fps?: number
  frameStart?: number
  frameLoop?: boolean
  rect?: { w: number; h: number; color: number }
  flip?: boolean
  motion?: Motion
  z: number
}

export type Scene = {
  W: number
  H: number
  /** Camera's world x at `now`; `camera`, when it will move, its keyframes (x = -camera). */
  camX: number
  camera?: Motion
  now: number
  skyTop: number
  skyBottom: number
  tiles: Tile[]
  structures: Tile[]
  actors: Actor[]
  biome: Biome
}

const k = (p: number, x = 0, y = 0, o = 1): Key => ({ p, x, y, o })

/** A motion that waits `delay` ms after `start`, hidden or held on its first key. */
function delayed(start: number, delay: number, dur: number, keys: Key[], isHiddenBefore = true): Motion {
  if (delay <= 0) {
    return { keys, dur, start, loop: false }
  }
  const total = delay + dur
  const d = delay / total
  const first = keys[0] ?? k(0)
  const lead = isHiddenBefore ? { ...first, o: 0 } : first

  return {
    keys: [
      { ...lead, p: 0 },
      { ...lead, p: Math.max(0, d - 0.0005) },
      ...keys.map(key => ({ ...key, p: d + key.p * (1 - d) })),
    ],
    dur: total,
    start,
    loop: false,
  }
}

const loop = (keys: Key[], dur: number, start = 0): Motion => ({ keys, dur, start, loop: true })

const MARK_ACTIVITY: Partial<Record<MarkKind, ActivityKind>> = {
  lectern: 'read',
  crafting: 'craft',
  furnace: 'smelt',
  target: 'test',
  chest: 'chest',
  enchant: 'magic',
  sign: 'plan',
  composter: 'compost',
  campfire: 'sleep',
  plank: 'build',
}

function markLook(kind: MarkKind, isActive: boolean): { frames: SpriteName[]; fps?: number } {
  switch (kind) {
    case 'lectern':
      return isActive ? { frames: ['lectern0', 'lectern1'], fps: 1.5 } : { frames: ['lectern0'] }
    case 'crafting':
      return { frames: ['crafting'] }
    case 'furnace':
      return isActive ? { frames: ['furnace_lit0', 'furnace_lit1'], fps: 5 } : { frames: ['furnace'] }
    case 'target':
      return { frames: ['target'] }
    case 'chest':
      return { frames: [isActive ? 'chest_open' : 'chest'] }
    case 'enchant':
      return { frames: ['enchant'] }
    case 'sign':
      return { frames: ['sign_lines'] }
    case 'composter':
      return { frames: ['composter'] }
    case 'campfire':
      return { frames: ['campfire0', 'campfire1'], fps: 4 }
    case 'torch':
      return { frames: ['torch0', 'torch1'], fps: 3 }
    default:
      return { frames: ['tex_plank'] }
  }
}

function skyColors(t: number, night: number, biome: Biome): [number, number] {
  if (biome === 'nether') {
    return [0x2a0808, 0x6b1e1e]
  }
  const glow = Math.max(0, 1 - Math.min(Math.abs(t - 0.5), t, 1 - t) / 0.07)
  const top = blend(blend(0x6fa8ff, 0x070b22, night), 0x4a5fa8, glow * 0.5)
  const bottom = blend(blend(0xbfdcff, 0x1b2350, night), 0xf2a15a, glow * 0.75)

  return [top, bottom]
}

const IDLE_FRAMES: SpriteName[] = [
  'clawd_idle',
  'clawd_idle',
  'clawd_idle',
  'clawd_idle',
  'clawd_idle',
  'clawd_idle',
  'clawd_idle',
  'clawd_blink',
]
const WALK_FRAMES: SpriteName[] = ['clawd_idle', 'clawd_step']

/**
 * The world at `now` as a list of things to draw. `lookaheadMs` > 0 asks for
 * terrain and the camera's glide far enough ahead for a renderer that
 * animates the walk by itself (the vector one); the cell renderer draws each
 * frame anew.
 */
export function composeScene(w: WorldState, now: number, W: number, H: number, lookaheadMs = 0): Scene {
  const L = layoutFor(W, H)
  const pos = posAt(w, now)
  const camX = cameraAt(w, now, L)
  const ahead = w.speed > 0 ? (w.speed * lookaheadMs) / 1000 : 0
  const from = Math.floor((camX - 24) / BLOCK)
  const to = Math.ceil((camX + W + ahead + 24) / BLOCK)
  const index = markIndex(w.marks, now)
  const ground = groundFn(L)
  const { tiles, structures, decor } = buildTerrain(w.seed, L, from, to, index)
  const biome = biomeAt(w.seed, colOf(pos))
  const t = dayTimeAt(w, now)
  const night = biome === 'nether' ? 0 : nightness(t)
  const [skyTop, skyBottom] = skyColors(t, night, biome)
  const actors: Actor[] = []
  const add = (a: Actor) => actors.push(a)

  // Clawd keeps his spot on screen; while he walks the world glides past at one pace.
  const screenX = pos - camX
  const camera: Motion | undefined =
    ahead > 0
      ? { keys: [k(0, -camX), k(1, -cameraAt(w, now + lookaheadMs, L))], dur: lookaheadMs, start: now, loop: false }
      : undefined

  /** Particles thrown out from one point, once. */
  const burst = (o: {
    x: number
    y: number
    n: number
    dist: number
    colors: number[]
    size?: number
    start: number
    delay?: number
    dur: number
    up?: number
    fall?: number
    salt: number
    z?: number
  }) => {
    for (let i = 0; i < o.n; i++) {
      const a = (i / o.n) * Math.PI * 2 + (hash(o.salt, i, 5) - 0.5) * 0.7
      const d = o.dist * (0.55 + 0.45 * hash(o.salt, i, 6))
      const dx = Math.cos(a) * d
      const dy = Math.sin(a) * d - (o.up ?? 0)
      const size = o.size ?? 2
      add({
        space: 'world',
        x: o.x - size / 2,
        y: o.y - size / 2,
        rect: { w: size, h: size, color: o.colors[i % o.colors.length] ?? 0xffffff },
        motion: delayed(o.start, o.delay ?? 0, o.dur, [k(0), k(0.55, dx * 0.85, dy * 0.85), k(1, dx, dy + (o.fall ?? 0), 0)]),
        z: o.z ?? 50,
      })
    }
  }

  /** Particles rising from one point, forever. */
  const stream = (o: {
    x: number
    y: number
    n: number
    dx: number
    dy: number
    colors: number[]
    size?: number
    dur: number
    z?: number
  }) => {
    for (let i = 0; i < o.n; i++) {
      const jitter = (hash(7, i, 9) - 0.5) * 4
      add({
        space: 'world',
        x: o.x + jitter,
        y: o.y,
        rect: { w: o.size ?? 1, h: o.size ?? 1, color: o.colors[i % o.colors.length] ?? 0xffffff },
        motion: loop([k(0, 0, 0, 0), k(0.15, 0, o.dy * 0.15), k(1, o.dx + jitter, o.dy, 0)], o.dur, (i / o.n) * o.dur),
        z: o.z ?? 48,
      })
    }
  }

  // ---- sky ----
  const skyH = Math.max(6, L.groundBase - 6)
  if (biome !== 'nether') {
    const isDay = t < 0.5
    const u = isDay ? t / 0.5 : (t - 0.5) / 0.5
    add({
      space: 'screen',
      x: Math.round(4 + u * (W - 12)),
      y: Math.round(1 + (1 - Math.sin(Math.PI * u)) * skyH * 0.6),
      frames: [isDay ? 'sun' : 'moon'],
      z: 2,
    })
    if (night > 0.3) {
      for (let i = 0; i < 18; i++) {
        const dur = 1800 + i * 97
        add({
          space: 'screen',
          x: Math.floor(hash(w.seed, i, 41) * W),
          y: Math.floor(hash(w.seed, i, 42) * skyH),
          rect: { w: 1, h: 1, color: i % 3 === 0 ? 0xfff4c0 : 0xffffff },
          motion: loop([k(0), k(0.5, 0, 0, 0.2), k(1)], dur, -hash(w.seed, i, 43) * dur),
          z: 1,
        })
      }
    }
    if (night < 0.7) {
      const color = blend(0xffffff, 0x5a6080, night)
      for (let i = 0; i < 3; i++) {
        const cw = 14 + Math.floor(hash(w.seed, i, 51) * 14)
        const cy = 2 + Math.floor(hash(w.seed, i, 52) * Math.max(1, skyH * 0.35))
        const dur = 70_000 + i * 23_000
        const drift = loop([k(0), k(1, -(W + cw + 6))], dur, -hash(w.seed, i, 53) * dur)
        add({ space: 'screen', x: W, y: cy, rect: { w: cw, h: 3, color }, motion: drift, z: 3 })
        add({ space: 'screen', x: W + 4, y: cy - 2, rect: { w: cw - 8, h: 2, color }, motion: drift, z: 3 })
      }
    }
  }

  // ---- ground decorations and what Claude left behind ----
  for (const d of decor) {
    add({ space: 'world', x: d.x, y: d.y, frames: [d.sprite], z: 15 })
  }
  for (const m of w.marks) {
    if (m.at > now || m.i < from - 2 || m.i > to + 2 || m.kind === 'pond' || m.kind === 'crater') {
      continue
    }
    const isActive = MARK_ACTIVITY[m.kind] === w.activity && m.i === w.anchor
    const look = markLook(m.kind, isActive)
    const s = sprite(look.frames[0] ?? 'tex_plank')
    const lift = m.kind === 'plank' ? (m.h ?? 0) * BLOCK : 0
    add({
      space: 'world',
      x: m.i * BLOCK + Math.floor((BLOCK - s.w) / 2),
      y: ground(m.i) - s.h - lift,
      frames: look.frames,
      fps: look.fps,
      motion: now - m.at < 400 ? { keys: [k(0, 0, -3, 0), k(1)], dur: 400, start: m.at, loop: false } : undefined,
      z: 20,
    })
  }

  // ---- Clawd ----
  const gy = ground(colOf(pos))
  const cy = gy - 10
  const clawd: Actor = { space: 'screen', x: screenX - 6, y: cy, frames: IDLE_FRAMES, fps: 3, z: 40 }
  const ax = w.anchor * BLOCK
  const ag = ground(w.anchor)
  switch (w.activity) {
    case 'walk':
      clawd.frames = WALK_FRAMES
      clawd.fps = 6
      break
    case 'think':
      clawd.frames = WALK_FRAMES
      clawd.fps = 3
      add({
        space: 'screen',
        x: screenX + 3,
        y: cy - 8,
        frames: ['bubble1', 'bubble2', 'bubble3'],
        fps: 2,
        z: 46,
      })
      break
    case 'sleep':
      clawd.frames = ['clawd_sleep']
      for (let i = 0; i < 2; i++) {
        add({
          space: 'world',
          x: pos + 2,
          y: cy + 2,
          frames: ['zzz'],
          motion: loop([k(0, 0, 0, 0), k(0.15, 1, -2), k(0.8, 5, -9), k(1, 6, -11, 0)], 2600, i * 1300),
          z: 46,
        })
      }
      break
    case 'hurt': {
      const before = Math.round(BOOM_MS / 200)
      clawd.frames = [...Array<SpriteName>(before).fill('clawd_idle'), 'clawd_hurt', 'clawd_hurt', 'clawd_hurt', 'clawd_idle']
      clawd.fps = 5
      clawd.frameLoop = false
      clawd.frameStart = w.activityAt
      clawd.motion = delayed(
        w.activityAt,
        BOOM_MS,
        1600,
        [k(0), k(0.18, -7, -6), k(0.35, -10), k(0.7, -10), k(1)],
        false,
      )
      break
    }
    case 'fish': {
      const rodX = pos + 6
      const rodY = cy - 2
      const waterY = ground(colOf(rodX + 7))
      add({ space: 'world', x: rodX, y: rodY, frames: ['rod'], z: 45 })
      add({
        space: 'world',
        x: rodX + 7,
        y: rodY + 1,
        rect: { w: 1, h: Math.max(1, waterY - rodY - 1), color: 0xe8e8e8 },
        z: 44,
      })
      add({
        space: 'world',
        x: rodX + 6,
        y: waterY - 1,
        frames: ['bobber'],
        motion: loop([k(0), k(0.5, 0, 1), k(1)], 1400, w.activityAt),
        z: 46,
      })
      break
    }
    case 'mine':
      add({ space: 'world', x: ax, y: ag - BLOCK, frames: ['tex_ore'], z: 21 })
      add({ space: 'world', x: pos + 4, y: cy - 4, frames: ['pick_up', 'pick_down'], fps: 4, z: 45 })
      stream({ x: ax + 1, y: ag - 5, n: 3, dx: -5, dy: -4, colors: [0x8c8c8c, 0x6a6a6a], dur: 500 })
      break
    case 'craft':
      stream({ x: ax + 4, y: ag - 9, n: 3, dx: 0, dy: -5, colors: [0xffffff, 0xffd23f], dur: 700 })
      break
    case 'build':
      break
    case 'smelt':
      stream({ x: ax + 3, y: ag - 9, n: 4, dx: 3, dy: -14, colors: [0xc9c9c9, 0x8c8c8c], size: 2, dur: 2000 })
      break
    case 'test': {
      add({ space: 'world', x: pos + 6, y: cy - 1, frames: ['bow'], z: 45 })
      const sx = pos + 8
      const sy = cy + 2
      const dx = ax - 8 - sx
      const dy = ag - 5 - sy
      add({
        space: 'world',
        x: sx,
        y: sy,
        frames: ['arrow'],
        motion: loop([k(0), k(0.35, dx, dy), k(0.6, dx, dy), k(0.61, dx, dy, 0), k(1, 0, 0, 0)], 1300, w.activityAt),
        z: 46,
      })
      break
    }
    case 'chest':
      stream({ x: ax + 4, y: ag - 8, n: 2, dx: 0, dy: -6, colors: [0x5fe3e0, 0xffd23f], dur: 900 })
      break
    case 'rocket':
      clawd.frames = ['clawd_cheer', 'clawd_idle']
      clawd.fps = 2
      add({ space: 'world', x: ax + 2, y: ag - 8, frames: ['rocket'], z: 21 })
      add({
        space: 'world',
        x: ax + 3,
        y: ag - 1,
        rect: { w: 1, h: 1, color: 0xffd23f },
        motion: loop([k(0), k(0.5, 0, 0, 0), k(1)], 300),
        z: 22,
      })
      break
    case 'magic':
      clawd.frames = ['clawd_idle', 'clawd_cheer']
      clawd.fps = 1.5
      add({
        space: 'world',
        x: ax,
        y: ag - 6 - 5,
        frames: ['book'],
        motion: loop([k(0), k(0.5, 0, -2), k(1)], 1800),
        z: 22,
      })
      for (let i = 0; i < 4; i++) {
        const ox = (i % 2 === 0 ? -1 : 1) * (8 + i * 2)
        const oy = -4 + i * 3
        add({
          space: 'world',
          x: ax + 2 + ox,
          y: ag - 10 + oy,
          frames: [(['glyph0', 'glyph1', 'glyph2', 'glyph3'] as const)[i] ?? 'glyph0'],
          motion: loop([k(0, 0, 0, 0), k(0.2), k(1, -ox, -oy, 0)], 1600, (i / 4) * 1600),
          z: 47,
        })
      }
      break
    case 'plan':
      break
    case 'wait':
      add({
        space: 'world',
        x: pos - 4,
        y: cy - 11,
        frames: ['sign_q'],
        motion: loop([k(0), k(0.5, 0, -1), k(1)], 800),
        z: 46,
      })
      break
    case 'compost':
      stream({ x: ax + 4, y: ag - 8, n: 3, dx: 0, dy: -7, colors: [0x5da130, 0x8ed16b], dur: 1100 })
      break
  }
  add(clawd)

  // ---- wolves (subagents) ----
  const isBusy = now - w.wolfBusyAt < 1500
  w.wolves.forEach((f, i) => {
    const off = -16 - 13 * i
    const wx = pos + off
    const isLeaving = f.leftAt !== undefined
    const isWalking = w.speed > 0 || isLeaving
    const wolf: Actor = {
      space: 'screen',
      x: screenX + off - 5,
      y: ground(colOf(wx)) - 7,
      frames: isWalking ? ['wolf_walk0', 'wolf_walk1'] : isBusy ? ['wolf_walk0', 'wolf_sit'] : ['wolf_sit'],
      fps: isWalking ? 6 : 4,
      z: 35,
    }
    if (f.leftAt !== undefined) {
      wolf.flip = true
      wolf.motion = { keys: [k(0), k(1, -40, 0, 0)], dur: 1600, start: f.leftAt, loop: false }
    } else if (now - f.at < 600) {
      wolf.motion = { keys: [k(0, 0, 0, 0), k(1)], dur: 600, start: f.at, loop: false }
    }
    add(wolf)
    if (isBusy && i === 0 && !isLeaving) {
      stream({ x: wx, y: ground(colOf(wx)) - 1, n: 3, dx: -4, dy: -4, colors: [0x8b5e3c, 0x6b4529], dur: 500 })
    }
  })

  // ---- one-off effects ----
  for (const e of w.effects) {
    const age = now - e.at
    if (age < 0 || age > EFFECT_MS) {
      continue
    }
    const eg = ground(colOf(e.x))
    const salt = Math.floor(e.at) % 100_000
    switch (e.kind) {
      case 'explode': {
        const cy0 = ground(colOf(e.x + 3)) - 11
        const flash = (on: number[]): Key[] => {
          const keys: Key[] = [k(0, 30, 0, 0), k(0.55, 0, 0, 0)]
          for (let i = 0; i + 1 < on.length; i += 2) {
            const a = on[i] ?? 0
            const b = on[i + 1] ?? 0
            keys.push(k(a, 0, 0, 0), k(a + 0.0005, 0, 0, 1), k(b, 0, 0, 1), k(b + 0.0005, 0, 0, 0))
          }
          keys.push(k(1, 0, 0, 0))

          return keys
        }
        add({
          space: 'world',
          x: e.x,
          y: cy0,
          frames: ['creeper'],
          motion: { keys: [k(0, 30), k(0.55), k(0.999), k(1, 0, 0, 0)], dur: BOOM_MS, start: e.at, loop: false },
          z: 42,
        })
        add({
          space: 'world',
          x: e.x,
          y: cy0,
          frames: ['creeper_flash'],
          motion: { keys: flash([0.6, 0.68, 0.76, 0.84, 0.9, 0.998]), dur: BOOM_MS, start: e.at, loop: false },
          z: 43,
        })
        for (const [dx, dy, fw, fh, color] of [
          [-8, -2, 22, 14, 0xffffff],
          [-4, -6, 14, 22, 0xffffff],
          [-2, 0, 10, 10, 0xfff3b0],
        ] as const) {
          add({
            space: 'world',
            x: e.x + dx,
            y: cy0 + dy,
            rect: { w: fw, h: fh, color },
            motion: delayed(e.at, BOOM_MS, 450, [k(0, 0, 0, 1), k(1, 0, 0, 0)]),
            z: 55,
          })
        }
        burst({
          x: e.x + 3,
          y: cy0 + 5,
          n: 14,
          dist: 20,
          colors: [0x9a9a9a, 0x555555, 0xdddddd],
          size: 3,
          start: e.at,
          delay: BOOM_MS,
          dur: 900,
          up: 4,
          salt,
        })
        burst({
          x: e.x + 3,
          y: cy0 + 9,
          n: 4,
          dist: 12,
          colors: [0x8b5e3c, 0x5da130],
          size: 2,
          start: e.at,
          delay: BOOM_MS,
          dur: 800,
          up: 8,
          fall: 10,
          salt: salt + 1,
        })
        break
      }
      case 'catch':
        add({
          space: 'world',
          x: e.x - 4,
          y: eg - 4,
          frames: ['fish'],
          flip: true,
          motion: {
            keys: [k(0, 0, 0, 1), k(0.45, -6, -14), k(0.85, -14, -6), k(1, -16, -4, 0)],
            dur: 1100,
            start: e.at,
            loop: false,
          },
          z: 50,
        })
        burst({ x: e.x, y: eg, n: 4, dist: 5, colors: [0x7aa8f5, 0xffffff], start: e.at, dur: 450, up: 4, salt })
        burst({
          x: e.x - 8,
          y: eg - 8,
          n: 3,
          dist: 6,
          colors: [0xb8f04a, 0xe8ff6a],
          start: e.at,
          delay: 700,
          dur: 800,
          up: 6,
          salt: salt + 2,
        })
        break
      case 'diamond':
        add({
          space: 'world',
          x: e.x - 3,
          y: eg - BLOCK - 6,
          frames: ['diamond'],
          motion: {
            keys: [k(0, 0, 4, 0), k(0.15, 0, -2), k(0.5, 0, -5), k(0.85, 0, -4), k(1, 0, -6, 0)],
            dur: 1600,
            start: e.at,
            loop: false,
          },
          z: 50,
        })
        burst({ x: e.x, y: eg - 8, n: 4, dist: 7, colors: [0xffffff, 0x5fe3e0], size: 1, start: e.at, dur: 700, salt })
        break
      case 'item':
        add({
          space: 'world',
          x: e.x - 3,
          y: eg - BLOCK - 8,
          frames: ['pick_up'],
          motion: { keys: [k(0, 0, 3, 0), k(0.2, 0, 0), k(0.8, 0, -3), k(1, 0, -5, 0)], dur: 1400, start: e.at, loop: false },
          z: 50,
        })
        break
      case 'block':
        burst({ x: e.x, y: eg - 4, n: 5, dist: 7, colors: [0xb38b55, 0x8a6a3f], start: e.at, dur: 500, salt })
        break
      case 'bullseye':
        burst({ x: e.x, y: eg - 4, n: 6, dist: 8, colors: [0xd93a1e, 0xffffff], start: e.at, dur: 650, salt })
        add({
          space: 'world',
          x: e.x - 2,
          y: eg - 16,
          frames: ['heart'],
          motion: { keys: [k(0, 0, 0, 0), k(0.2), k(1, 0, -6, 0)], dur: 1200, start: e.at, loop: false },
          z: 50,
        })
        break
      case 'firework': {
        const rise = -(eg - 14)
        add({
          space: 'world',
          x: e.x - 1,
          y: eg - 8,
          frames: ['rocket'],
          motion: { keys: [k(0), k(0.98, 0, rise), k(1, 0, rise, 0)], dur: 1100, start: e.at, loop: false },
          z: 50,
        })
        burst({
          x: e.x,
          y: 6,
          n: 18,
          dist: 13,
          colors: [0xff5555, 0xffd23f, 0x55ff99, 0x55aaff, 0xff77ff],
          start: e.at,
          delay: 1100,
          dur: 1100,
          fall: 5,
          salt,
        })
        break
      }
      case 'sparkle':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2
          add({
            space: 'world',
            x: e.x - 1,
            y: eg - 12,
            frames: [(['glyph0', 'glyph1', 'glyph2', 'glyph3'] as const)[i % 4] ?? 'glyph0'],
            motion: {
              keys: [k(0, 0, 0, 0), k(0.15), k(1, Math.cos(a) * 12, Math.sin(a) * 8 - 8, 0)],
              dur: 1300,
              start: e.at,
              loop: false,
            },
            z: 50,
          })
        }
        break
      case 'pearl':
        burst({
          x: e.x,
          y: eg - 5,
          n: 12,
          dist: 12,
          colors: [0x8e44ad, 0x2a9d8f, 0xd2a6ee],
          start: e.at,
          dur: 900,
          up: 3,
          salt,
        })
        break
      case 'flag':
        burst({ x: e.x, y: eg - 8, n: 4, dist: 5, colors: [0xffd23f, 0xff8c1a], size: 1, start: e.at, dur: 700, up: 4, salt })
        break
      case 'bone':
        add({
          space: 'world',
          x: e.x - 3,
          y: eg - 3,
          frames: ['bone'],
          motion: { keys: [k(0, 0, -6), k(0.3), k(0.8), k(1, 0, 0, 0)], dur: 1500, start: e.at, loop: false },
          z: 50,
        })
        add({
          space: 'world',
          x: e.x - 2,
          y: eg - 14,
          frames: ['heart'],
          motion: { keys: [k(0, 0, 0, 0), k(0.2), k(1, 0, -6, 0)], dur: 1200, start: e.at, loop: false },
          z: 50,
        })
        break
      case 'howl':
        burst({ x: e.x, y: eg - 4, n: 8, dist: 8, colors: [0xffffff, 0xc9c9c9], size: 2, start: e.at, dur: 600, salt })
        break
    }
  }

  actors.sort((a, b) => a.z - b.z)

  return {
    W,
    H,
    camX,
    camera,
    now,
    skyTop,
    skyBottom,
    tiles,
    structures,
    actors,
    biome,
  }
}

// ---------- sampling, shared by both renderers ----------

/** Offset and opacity of a motion at `now`. */
export function sample(m: Motion | undefined, now: number): { x: number; y: number; o: number } {
  if (!m || m.keys.length === 0 || m.dur <= 0) {
    return { x: 0, y: 0, o: 1 }
  }
  let p = (now - m.start) / m.dur
  p = m.loop ? p - Math.floor(p) : Math.max(0, Math.min(1, p))
  const keys = m.keys
  let a = keys[0] ?? k(0)
  if (p <= a.p) {
    return { x: a.x, y: a.y, o: a.o }
  }
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i] ?? a
    if (p <= b.p) {
      const f = b.p > a.p ? (p - a.p) / (b.p - a.p) : 1

      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, o: a.o + (b.o - a.o) * f }
    }
    a = b
  }

  return { x: a.x, y: a.y, o: a.o }
}

/** Which frame an actor shows at `now`. */
export function frameAt(a: Actor, now: number): SpriteName | undefined {
  const frames = a.frames
  if (!frames || frames.length === 0) {
    return undefined
  }
  if (frames.length === 1 || !a.fps) {
    return frames[0]
  }
  let i = Math.floor(((now - (a.frameStart ?? 0)) / 1000) * a.fps)
  i = a.frameLoop === false ? Math.max(0, Math.min(frames.length - 1, i)) : ((i % frames.length) + frames.length) % frames.length

  return frames[i]
}
