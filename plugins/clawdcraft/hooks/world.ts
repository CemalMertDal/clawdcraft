import type { ActivityKind, EffectKind, MarkKind, WorldEffect, WorldMark, WorldState } from '../types'
import type { Classified } from './activity'
import type { SpriteName, TextureName } from './sprites'
import { sprite } from './sprites'

export const BLOCK = 8
/** World pixels per second while walking or thinking: one pace, so the scene never lurches. */
export const WALK_SPEED = 12
/** A whole day while Claude works; night falls after this long idle. */
export const DAY_MS = 20 * 60_000
export const IDLE_NIGHT_MS = 60_000
export const HURT_MS = 3000
/** When the creeper goes off, after the error. */
export const BOOM_MS = 2000
export const EFFECT_MS = 6000
export const BIOME_SPAN = 64
export const NETHER_FROM = 1500

export type Biome = 'plains' | 'forest' | 'desert' | 'taiga' | 'mushroom' | 'nether'

export const BIOME_LABEL: Record<Biome, string> = {
  plains: 'Çayır',
  forest: 'Orman',
  desert: 'Çöl',
  taiga: 'Karlı Tayga',
  mushroom: 'Mantar Adası',
  nether: 'Nether',
}

const CYCLE: Biome[] = ['plains', 'forest', 'desert', 'taiga', 'mushroom']

const SURFACE: Record<Biome, [TextureName, TextureName]> = {
  plains: ['tex_grass', 'tex_dirt'],
  forest: ['tex_grass', 'tex_dirt'],
  desert: ['tex_sand', 'tex_sandstone'],
  taiga: ['tex_snow', 'tex_dirt'],
  mushroom: ['tex_mycelium', 'tex_dirt'],
  nether: ['tex_nylium', 'tex_netherrack'],
}

/** The mark an activity leaves where it happened. */
const MARK_OF: Partial<Record<ActivityKind, MarkKind>> = {
  fish: 'pond',
  read: 'lectern',
  craft: 'crafting',
  smelt: 'furnace',
  test: 'target',
  chest: 'chest',
  magic: 'enchant',
  plan: 'sign',
  compost: 'composter',
  build: 'plank',
  sleep: 'campfire',
}

export function initialWorld(seed: number, distance: number, now: number): WorldState {
  return {
    seed,
    distanceAt: distance,
    movedAt: now,
    speed: 0,
    activity: 'idle',
    activityAt: now,
    anchor: Math.floor(distance / BLOCK) + 2,
    running: [],
    effects: [],
    marks: [],
    wolves: [],
    wolfBusyAt: 0,
    isWorking: false,
    idleSince: now,
    dayAt: 0.1,
    dayMovedAt: now,
    tools: 0,
    streak: 0,
    explosions: 0,
  }
}

// ---------- noise ----------

/** A stable pseudo-random number in [0, 1) for a seed and coordinates. */
export function hash(seed: number, a: number, b = 0): number {
  let h = (seed ^ Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e37, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0

  return h / 4294967296
}

export function biomeAt(seed: number, i: number): Biome {
  const seg = Math.floor(i / BIOME_SPAN)
  if (seg <= 0) {
    return 'plains'
  }
  if (i >= NETHER_FROM && hash(seed, seg, 77) < 0.25) {
    return 'nether'
  }

  return CYCLE[Math.floor(hash(seed, seg, 11) * CYCLE.length)] ?? 'plains'
}

// ---------- layout ----------

export type Layout = {
  /** Scene size in world pixels. */
  W: number
  H: number
  /** The ground's top: one flat plane everywhere. */
  groundBase: number
  /** Where Clawd stands on screen, from the left edge. */
  lo: number
}

export function layoutFor(W: number, H: number): Layout {
  const groundDepth = H >= 40 ? 16 : 8

  return { W, H, groundBase: H - groundDepth, lo: Math.round(Math.max(24, Math.min(W * 0.3, 120))) }
}

export const colOf = (px: number) => Math.floor(px / BLOCK)

/** Marks by the columns they touch (a pond three, a crater two). */
export function markIndex(marks: readonly WorldMark[], now: number): Map<number, WorldMark[]> {
  const index = new Map<number, WorldMark[]>()
  for (const m of marks) {
    if (m.at > now) {
      continue
    }
    const span = m.kind === 'pond' ? 3 : m.kind === 'crater' ? 2 : 1
    for (let d = 0; d < span; d++) {
      const list = index.get(m.i + d)
      if (list) {
        list.push(m)
      } else {
        index.set(m.i + d, [m])
      }
    }
  }

  return index
}

/** The y of the ground's top at column `i`: the same everywhere, the world is flat. */
export function groundFn(L: Layout): (i: number) => number {
  return () => L.groundBase
}

// ---------- terrain ----------

/** A run of one texture, in world pixels. */
export type Tile = { x: number; y: number; w: number; h: number; tex: TextureName }
/** A small sprite standing on the ground, in world pixels. */
export type Decor = { x: number; y: number; sprite: SpriteName }

export function buildTerrain(
  seed: number,
  L: Layout,
  from: number,
  to: number,
  index: Map<number, WorldMark[]>,
): { tiles: Tile[]; structures: Tile[]; decor: Decor[] } {
  const ground = groundFn(L)
  const tiles: Tile[] = []
  const structures: Tile[] = []
  const decor: Decor[] = []
  let prevTop: Tile | null = null
  let prevFill: Tile | null = null

  for (let c = from; c <= to; c++) {
    const biome = biomeAt(seed, c)
    const gy = ground(c)
    const marks = index.get(c)
    const isPond = marks?.some(m => m.kind === 'pond') ?? false
    const isCrater = marks?.some(m => m.kind === 'crater') ?? false
    const [surface, filler] = SURFACE[biome]
    let top: TextureName = surface
    if (isPond) {
      top = 'tex_water'
    } else if (isCrater) {
      top = 'tex_crater'
    } else if (biome === 'nether' && hash(seed, c, 31) < 0.08) {
      top = 'tex_lava'
    }
    const x = c * BLOCK
    if (prevTop && prevTop.tex === top && prevTop.y === gy && prevTop.x + prevTop.w === x) {
      prevTop.w += BLOCK
    } else {
      prevTop = { x, y: gy, w: BLOCK, h: BLOCK, tex: top }
      tiles.push(prevTop)
    }
    const fillY = gy + BLOCK
    const fillH = Math.max(0, L.H - fillY)
    if (fillH > 0) {
      if (prevFill && prevFill.tex === filler && prevFill.y === fillY && prevFill.x + prevFill.w === x) {
        prevFill.w += BLOCK
      } else {
        prevFill = { x, y: fillY, w: BLOCK, h: fillH, tex: filler }
        tiles.push(prevFill)
      }
    } else {
      prevFill = null
    }

    const isClear = !index.has(c - 1) && !marks && !index.has(c + 1) && top === surface
    if (!isClear) {
      continue
    }
    const r = hash(seed, c, 21)
    const r2 = hash(seed, c, 22)
    const put = (name: SpriteName) => {
      const s = sprite(name)
      decor.push({ x: x + Math.floor((BLOCK - s.w) / 2), y: gy - s.h, sprite: name })
    }
    switch (biome) {
      case 'plains':
        if (c % 5 === 0 && r < 0.35) {
          tree(structures, x, gy, 'tex_log', 'tex_leaves', 3)
        } else if (r2 < 0.3) {
          put('tallgrass')
        } else if (r2 < 0.38) {
          put('flower_red')
        } else if (r2 < 0.45) {
          put('flower_yellow')
        }
        break
      case 'forest':
        if (c % 3 === 0 && r < 0.6) {
          const isBirch = hash(seed, c, 23) < 0.35
          tree(structures, x, gy, isBirch ? 'tex_birch' : 'tex_log', 'tex_leaves', isBirch ? 4 : 3)
        } else if (r2 < 0.35) {
          put('tallgrass')
        }
        break
      case 'desert':
        if (c % 4 === 0 && r < 0.35) {
          const h = r2 < 0.5 ? 2 : 3
          structures.push({ x, y: gy - h * BLOCK, w: BLOCK, h: h * BLOCK, tex: 'tex_cactus' })
        } else if (r2 < 0.12) {
          put('deadbush')
        }
        break
      case 'taiga':
        if (c % 4 === 0 && r < 0.55) {
          spruce(structures, x, gy)
        }
        break
      case 'mushroom':
        if (c % 6 === 0 && r < 0.45) {
          structures.push({ x, y: gy - 2 * BLOCK, w: BLOCK, h: 2 * BLOCK, tex: 'tex_stem' })
          structures.push({ x: x - BLOCK, y: gy - 3 * BLOCK, w: 3 * BLOCK, h: BLOCK, tex: 'tex_cap' })
        } else if (r2 < 0.18) {
          put('mushroom_small')
        }
        break
      case 'nether':
        if (r2 < 0.15) {
          put('fungus')
        }
        break
    }
  }

  return { tiles, structures, decor }
}

function tree(out: Tile[], x: number, gy: number, log: TextureName, leaves: TextureName, trunk: number) {
  out.push({ x, y: gy - trunk * BLOCK, w: BLOCK, h: trunk * BLOCK, tex: log })
  out.push({ x: x - BLOCK, y: gy - (trunk + 1) * BLOCK, w: 3 * BLOCK, h: 2 * BLOCK, tex: leaves })
  out.push({ x, y: gy - (trunk + 2) * BLOCK, w: BLOCK, h: BLOCK, tex: leaves })
}

function spruce(out: Tile[], x: number, gy: number) {
  out.push({ x, y: gy - 2 * BLOCK, w: BLOCK, h: 2 * BLOCK, tex: 'tex_log' })
  out.push({ x: x - BLOCK, y: gy - 3 * BLOCK, w: 3 * BLOCK, h: BLOCK, tex: 'tex_spruce' })
  out.push({ x, y: gy - 5 * BLOCK, w: BLOCK, h: 2 * BLOCK, tex: 'tex_spruce' })
}

// ---------- time ----------

export function posAt(w: WorldState, now: number): number {
  return w.distanceAt + (w.speed * Math.max(0, now - w.movedAt)) / 1000
}

const frac = (t: number) => t - Math.floor(t)

/** Time of day, 0..1: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight. */
export function dayTimeAt(w: WorldState, now: number): number {
  if (w.isWorking) {
    return frac(w.dayAt + Math.max(0, now - w.dayMovedAt) / DAY_MS)
  }
  const base = w.dayAt
  const idle = now - w.idleSince
  if (idle <= IDLE_NIGHT_MS || base >= 0.55) {
    return base
  }
  const k = Math.min(1, (idle - IDLE_NIGHT_MS) / 8000)

  return base + (0.75 - base) * k
}

/** How dark it is, 0 (day) to 1 (night). */
export function nightness(t: number): number {
  if (t < 0.05) {
    return Math.max(0, 0.5 - t / 0.1)
  }
  if (t <= 0.45) {
    return 0
  }
  if (t < 0.55) {
    return (t - 0.45) / 0.1
  }
  if (t <= 0.95) {
    return 1
  }

  return 1 - (t - 0.95) / 0.1
}

// ---------- transitions ----------

function commit(w: WorldState, now: number): WorldState {
  return {
    ...w,
    distanceAt: posAt(w, now),
    movedAt: now,
    dayAt: dayTimeAt(w, now),
    dayMovedAt: now,
  }
}

/**
 * The camera's world x at time `t`: it follows Clawd at one steady pace,
 * keeping him at the same spot on screen, and stands when he stands.
 */
export function cameraAt(w: WorldState, t: number, L: Layout): number {
  return posAt(w, t) - L.lo
}

function addEffect(effects: readonly WorldEffect[], kind: EffectKind, x: number, at: number): WorldEffect[] {
  return [...effects.filter(e => at - e.at < EFFECT_MS), { kind, at, x }].slice(-24)
}

export function setActivity(w: WorldState, kind: ActivityKind, now: number): WorldState {
  const c = commit(w, now)
  const pos = c.distanceAt
  const speed = kind === 'walk' || kind === 'think' ? WALK_SPEED : 0
  let anchor = c.anchor
  let marks = c.marks
  const markKind = MARK_OF[kind]
  if (markKind) {
    anchor = kind === 'fish' ? colOf(pos + 10) : kind === 'test' ? colOf(pos) + 4 : colOf(pos) + 2
    const near = [...marks].reverse().find(m => m.kind === markKind && Math.abs(m.i - anchor) <= 3)
    if (markKind === 'plank') {
      const stack = near ? marks.filter(m => m.kind === 'plank' && m.i === near.i).length : 0
      const i = near && stack < 3 ? near.i : anchor
      anchor = i
      marks = [...marks, { kind: 'plank', i, at: now, h: near && stack < 3 ? stack : 0 }]
    } else if (near) {
      anchor = near.i
    } else {
      marks = [...marks, { kind: markKind, i: anchor, at: now }]
    }
  } else if (kind === 'mine' || kind === 'rocket') {
    anchor = colOf(pos) + 2
  }

  return { ...c, activity: kind, activityAt: now, speed, anchor, marks }
}

/** Where a success effect plays, in world pixels. */
function effectX(w: WorldState, kind: EffectKind): number {
  switch (kind) {
    case 'catch':
      return w.distanceAt + 13
    case 'firework':
      return w.anchor * BLOCK + 2
    default:
      return w.anchor * BLOCK + 4
  }
}

function resume(w: WorldState, now: number): WorldState {
  const last = w.running[w.running.length - 1]
  if (last) {
    return setActivity(w, last.kind, now)
  }

  return setActivity(w, w.isWorking ? 'think' : 'idle', now)
}

export function startTool(w: WorldState, id: string, cls: Classified, now: number): WorldState {
  const n: WorldState = {
    ...w,
    isWorking: true,
    running: [...w.running.filter(r => r.id !== id), { id, kind: cls.kind, at: now }],
    tools: w.tools + 1,
  }
  if (cls.tag === 'agent') {
    const pos = posAt(n, now)
    const wolves = [...n.wolves, { id, at: now }]

    const spawned = { ...n, wolves, effects: addEffect(n.effects, 'howl', pos - 18, now) }

    // Clawd waits while the wolf runs its errand: nothing scrolls while it digs.
    return isHurt(spawned, now) ? spawned : setActivity(spawned, 'idle', now)
  }

  return isHurt(n, now) ? n : setActivity(n, cls.kind, now)
}

/** While the creeper's blast plays out, new work waits for `recover`. */
function isHurt(w: WorldState, now: number): boolean {
  return w.activity === 'hurt' && now - w.activityAt < HURT_MS
}

export type Outcome = 'ok' | 'error' | 'denied'

export function endTool(w: WorldState, id: string, cls: Classified, outcome: Outcome, now: number): WorldState {
  const c = commit(w, now)
  let n: WorldState = { ...c, running: c.running.filter(r => r.id !== id) }
  if (cls.tag === 'agent') {
    n = {
      ...n,
      wolves: n.wolves.map(f => (f.id === id && !f.leftAt ? { ...f, leftAt: now } : f)),
      effects: addEffect(n.effects, 'bone', n.distanceAt - 16, now),
    }
  }
  if (outcome === 'error') {
    return explode(n, now)
  }
  if (outcome === 'ok') {
    n = { ...n, streak: n.streak + 1 }
    if (cls.success) {
      n = { ...n, effects: addEffect(n.effects, cls.success, effectX(n, cls.success), now) }
    }
  }
  if (isHurt(n, now)) {
    return n
  }

  return resume(n, now)
}

/** A creeper walks up and goes off; Clawd stands still while it does. */
export function explode(w: WorldState, now: number): WorldState {
  const pos = posAt(w, now)
  const x = pos + 14
  const n: WorldState = {
    ...w,
    streak: 0,
    explosions: w.explosions + 1,
    effects: addEffect(w.effects, 'explode', x, now),
    marks: [...w.marks, { kind: 'crater', i: colOf(x + 3), at: now + BOOM_MS }],
  }

  return setActivity(n, 'hurt', now)
}

export function recover(w: WorldState, now: number): WorldState | null {
  if (w.activity !== 'hurt' || now - w.activityAt < HURT_MS) {
    return null
  }

  return resume(w, now)
}

export function turnStart(w: WorldState, now: number): WorldState {
  const c = commit(w, now)
  let n: WorldState = { ...c, isWorking: true }
  if (nightness(c.dayAt) > 0.5 || c.activity === 'sleep') {
    n = { ...n, dayAt: 0.02, dayMovedAt: now, effects: addEffect(n.effects, 'sunrise', c.distanceAt, now) }
  }

  return setActivity(n, 'think', now)
}

export type TurnEnd = 'answer' | 'aborted' | 'error' | 'refusal'

export function turnEnd(w: WorldState, reason: TurnEnd, durationMs: number, now: number): WorldState {
  const c = commit(w, now)
  const pos = c.distanceAt
  let n: WorldState = {
    ...c,
    running: [],
    isWorking: false,
    idleSince: now,
    wolves: c.wolves.map(f => (f.leftAt ? f : { ...f, leftAt: now })),
  }
  if (reason === 'answer') {
    n = {
      ...n,
      marks: [...n.marks, { kind: 'torch', i: colOf(pos) + 1, at: now }],
      effects: addEffect(n.effects, 'flag', (colOf(pos) + 1) * BLOCK + 1, now),
    }
    if (durationMs > 120_000) {
      n = { ...n, anchor: colOf(pos) + 2, effects: addEffect(n.effects, 'firework', (colOf(pos) + 2) * BLOCK + 2, now) }
    }
  } else if (reason === 'aborted') {
    n = { ...n, effects: addEffect(n.effects, 'pearl', pos, now) }
  } else if (reason === 'error') {
    return explode(n, now)
  }

  return setActivity(n, 'idle', now)
}

export function goSleep(w: WorldState, now: number): WorldState | null {
  if (w.isWorking || w.activity === 'sleep' || w.activity === 'hurt' || now - w.idleSince < IDLE_NIGHT_MS) {
    return null
  }

  return setActivity(w, 'sleep', now)
}

/** Commits a long walk, so the drawn walk (two minutes ahead) never runs out. */
export function refreshWalk(w: WorldState, now: number): WorldState | null {
  if (w.speed <= 0 || now - w.movedAt < 100_000) {
    return null
  }

  return commit(w, now)
}

/** Drops what has played out; only while Clawd stands, so a redraw never interrupts a walk. */
export function prune(w: WorldState, now: number): WorldState | null {
  if (w.speed > 0) {
    return null
  }
  const col = colOf(posAt(w, now))
  const effects = w.effects.filter(e => now - e.at < EFFECT_MS)
  const wolves = w.wolves.filter(f => !f.leftAt || now - f.leftAt < 2000)
  const marks = w.marks.filter(m => m.i >= col - 100).slice(-80)
  if (effects.length === w.effects.length && wolves.length === w.wolves.length && marks.length === w.marks.length) {
    return null
  }

  return { ...w, effects, wolves, marks }
}
