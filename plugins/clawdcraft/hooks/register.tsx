import { atom, read, update } from 'claude-code'
import type { Elements, Register } from 'claude-code'

import type { ActivityKind, ViewMode, WorldState } from '../types'
import type { AchievementId, Life } from './achievements'
import { ACHIEVEMENTS, asLife, toastText } from './achievements'
import type { Classified } from './activity'
import { ACTIVITY_LABEL, classify } from './activity'
import { downsample2, drawMiniClawd, packCells, rasterize } from './render-raster'
import { renderSvg } from './render-svg'
import { composeScene } from './scene'
import type { Outcome } from './world'
import {
  BIOME_LABEL,
  BLOCK,
  IDLE_NIGHT_MS,
  biomeAt,
  colOf,
  endTool,
  goSleep,
  initialWorld,
  posAt,
  prune,
  recover,
  refreshWalk,
  setActivity,
  startTool,
  turnEnd,
  turnStart,
} from './world'

const PANE = 'clawdcraft'
const RASTER_KEY = 'world'
/** CSS pixels per world pixel on the vector surfaces, and how far ahead a walk is drawn. */
const SVG_SCALE = 3
const SVG_LOOKAHEAD_MS = 120_000
/** Terminal animation: one frame per this many ms. */
const FRAME_MS = 125
/** The terminal draws the world at half size, and its band is this many rows tall. */
const TERMINAL_BAND_ROWS = 11
/** How much of their brightness the grass and dirt keep on the terminal's black. */
const TERMINAL_GROUND_SHADE = 0.66

const WORLD_REF = { plugin: 'clawdcraft', key: 'world' } as const
const VIEW_REF = { plugin: 'clawdcraft', key: 'view' } as const
const world = atom(WORLD_REF, initialWorld(1, 0, 0))
const view = atom(VIEW_REF, 'band')

/** What the timers and the event hooks reach the engine through, made in session.start. */
type Io = {
  now: () => Promise<number>
  read: () => Promise<WorldState>
  write: (change: (w: WorldState) => WorldState) => Promise<WorldState>
  setView: (v: ViewMode) => Promise<ViewMode>
  blit: (requestId: string, cells: string, columns: number, rows: number) => Promise<boolean>
  toast: (text: string) => void
  status: (text: string | undefined) => void
  log: (text: string) => void
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  openPane: () => Promise<unknown>
  closePane: () => Promise<void>
  after: (ms: number, fn: () => void) => { cancel: () => void }
}

// The module's own memory; a reload starts it over and session.start refills it.
let io: Io | null = null
let cache: WorldState | null = null
let life: Life | null = null
let isLifeDirty = false
let lastSave = 0
let chain: Promise<unknown> = Promise.resolve()
let isTicking = false
let demo: { cancel: () => void }[] = []
/** The terminal Rasters on screen, by site, at the size each was drawn. */
const mounts = new Map<string, { columns: number; rows: number }>()

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.floor(n)))

function debug(err: unknown) {
  try {
    io?.log(`clawdcraft: ${err instanceof Error ? err.message : String(err)}`)
  } catch {
    // nothing to tell it to
  }
}

/**
 * Applies `change` to the world, one change at a time; `null` writes
 * nothing (so the drawings stay as they are).
 */
function mutate(change: (w: WorldState, now: number) => WorldState | null): Promise<void> {
  const d = io
  if (!d) {
    return Promise.resolve()
  }
  const run = chain
    .then(async () => {
      const now = await d.now()
      const current = await d.read()
      if (change(current, now) === null) {
        cache = current
        return
      }
      cache = await d.write(w => change(w, now) ?? w)
    })
    .catch(debug)
  chain = run

  return run
}

// ---------- the life across sessions ----------

function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

async function saveLife(now: number) {
  if (!io || !life || !isLifeDirty) {
    return
  }
  isLifeDirty = false
  lastSave = now
  await io.storeSet('life', life)
}

function unlock(id: AchievementId) {
  if (!life || life.unlocked.includes(id)) {
    return
  }
  life.unlocked = [...life.unlocked, id]
  isLifeDirty = true
  io?.toast(toastText(id))
}

function counted(fn: (l: Life) => void) {
  if (life) {
    fn(life)
    isLifeDirty = true
  }
}

function onToolStart(cls: Classified) {
  counted(l => {
    l.tools += 1
    if (cls.kind === 'read') {
      l.reads += 1
    }
  })
  unlock('stone-age')
  if (cls.tag === 'fetch') {
    unlock('gone-fishing')
  }
  if (cls.tag === 'skill') {
    unlock('apprentice')
  }
  if (cls.tag === 'agent') {
    unlock('best-friend')
  }
  if ((life?.reads ?? 0) >= 100) {
    unlock('bookworm')
  }
  const w = cache
  if (w) {
    if (w.tools + 1 >= 50) {
      unlock('diamonds')
    }
    if (cls.tag === 'agent' && w.wolves.filter(f => !f.leftAt).length + 1 >= 3) {
      unlock('pack')
    }
  }
}

function onToolEnd(cls: Classified, outcome: Outcome) {
  if (outcome === 'error') {
    onExplosion()
    return
  }
  if (outcome !== 'ok') {
    return
  }
  if (cls.success === 'catch') {
    counted(l => {
      l.fish += 1
    })
  }
  if (cls.tag === 'push') {
    unlock('fireworks')
  }
  if ((cache?.streak ?? 0) + 1 >= 25) {
    unlock('survivor')
  }
}

function onExplosion() {
  counted(l => {
    l.explosions += 1
  })
  unlock('aw-man')
  if ((life?.explosions ?? 0) >= 10) {
    unlock('creeper-hunter')
  }
}

// ---------- timers ----------

/** Where the terminal writes the tag over Clawd's head, in cells. */
type CellTag = { text: string; column: number; row: number }

/**
 * A frame for a Raster `columns` x `rows`: the world drawn at twice that and
 * halved, Clawd drawn on top with his own small sprite; and where his tag goes.
 */
function terminalFrame(w: WorldState, now: number, columns: number, rows: number): { cells: string; tag?: CellTag } {
  const W = columns * 2
  const H = rows * 4
  const mask = new Uint8Array(W * H)
  const scene = composeScene(w, now, W, H, 0)
  const full = rasterize(scene, now, { mask, groundShade: TERMINAL_GROUND_SHADE, isClawdSkipped: true })
  const half = downsample2(full, mask, W, H)
  drawMiniClawd(scene, now, half, columns, rows * 2)
  const t = scene.tag
  // The tag sits 2 world pixels over Clawd's head, and he is 10 tall: his feet are at t.y + 12.
  // Halved, the 7-pixel mini sprite stands on them; the tag goes in the cell row above its top.
  const miniTop = (t ? t.y + 12 : 0) / 2 - 7
  const tag = t
    ? { text: ` ${t.text} `, column: Math.round(t.x / 2 - 1.5), row: Math.max(0, Math.floor(miniTop / 2) - 1) }
    : undefined

  return { cells: packCells(half, columns, rows * 2, columns, rows), tag }
}

function terminalCells(w: WorldState, now: number, columns: number, rows: number): string {
  return terminalFrame(w, now, columns, rows).cells
}

async function tick() {
  const w = cache
  const d = io
  if (isTicking || mounts.size === 0 || !w || !d) {
    return
  }
  isTicking = true
  try {
    const now = await d.now()
    for (const [requestId, m] of [...mounts]) {
      const isTaken = await d.blit(requestId, terminalCells(w, now, m.columns, m.rows), m.columns, m.rows)
      if (!isTaken) {
        mounts.delete(requestId)
      }
    }
  } catch (err) {
    debug(err)
  } finally {
    isTicking = false
  }
}

async function housekeep() {
  const w = cache
  const d = io
  if (!w || !d) {
    return
  }
  const now = await d.now()
  const steps = [recover, goSleep, refreshWalk, prune]
  if (steps.some(step => step(w, now) !== null)) {
    const isFallingAsleep = goSleep(w, now) !== null
    await mutate((cur, t) => {
      let n = cur
      let isChanged = false
      for (const step of steps) {
        const r = step(n, t)
        if (r) {
          n = r
          isChanged = true
        }
      }

      return isChanged ? n : null
    })
    if (isFallingAsleep) {
      counted(l => {
        l.nights += 1
      })
      unlock('sweet-dreams')
    }
  }
  const pos = posAt(w, now)
  if (life && Math.abs(life.distance - pos) >= BLOCK) {
    life.distance = pos
    isLifeDirty = true
  }
  if (pos >= 1000 * BLOCK) {
    unlock('long-road')
  }
  if (biomeAt(w.seed, colOf(pos)) === 'nether') {
    unlock('nether')
  }
  if (now - lastSave > 30_000) {
    await saveLife(now)
  }
}

// ---------- drawing ----------

function describe(w: WorldState, now: number): string {
  const pos = posAt(w, now)

  return `Clawd is ${ACTIVITY_LABEL[w.activity]} in the ${BIOME_LABEL[biomeAt(w.seed, colOf(pos))]} (block ${colOf(pos)})`
}

/** The Raster's size for a site, remembered so the timer can repaint it. */
function rasterProps(w: WorldState, now: number, requestId: string, columns: number, rowsAvailable: number, isBand: boolean) {
  const cols = clamp(columns, 16, 512)
  const rows = isBand
    ? clamp(Math.min(TERMINAL_BAND_ROWS, rowsAvailable - 1), 4, TERMINAL_BAND_ROWS)
    : clamp(rowsAvailable, 4, 20)
  mounts.set(requestId, { columns: cols, rows })
  const frame = terminalFrame(w, now, cols, rows)

  return { raster: { key: RASTER_KEY, columns: cols, rows, cells: frame.cells }, tag: frame.tag }
}

/** The terminal's drawing: the world, and Clawd's tag laid over it in a pale box. */
function terminalTree(els: Elements['terminal'], props: ReturnType<typeof rasterProps>) {
  const { Box, Raster, Text } = els
  const { raster, tag } = props

  return (
    <Box width={raster.columns} height={raster.rows}>
      <Raster {...raster} />
      {tag && (
        <Box position="absolute" top={tag.row} left={Math.max(0, tag.column - Math.floor(tag.text.length / 2))}>
          <Text color="#1b1b1b" backgroundColor="#e8e8e8">
            {tag.text}
          </Text>
        </Box>
      )}
    </Box>
  )
}

function svgProps(w: WorldState, now: number, columns: number, isBand: boolean) {
  const H = isBand ? 56 : 72
  const W = Math.ceil(clamp(columns * 8, 240, 2400) / SVG_SCALE)
  const scene = composeScene(w, now, W, H, SVG_LOOKAHEAD_MS)

  return {
    source: renderSvg(scene, now, { scale: SVG_SCALE }),
    alt: describe(w, now),
    width: W * SVG_SCALE,
    height: H * SVG_SCALE,
    isInteractive: true as const,
  }
}

// ---------- the /mc command ----------

async function setView(v: ViewMode) {
  if (!io) {
    return
  }
  await io.setView(v)
  await io.storeSet('view', v)
  if (v === 'pane') {
    await io.openPane()
  } else {
    await io.closePane()
  }
}

function stats(w: WorldState, now: number): string {
  const l = life
  const pos = posAt(w, now)
  const ids = Object.keys(ACHIEVEMENTS) as AchievementId[]
  const got = ids.filter(id => l?.unlocked.includes(id))
  const lines = [
    `ClawdCraft: Clawd is ${ACTIVITY_LABEL[w.activity]} in the ${BIOME_LABEL[biomeAt(w.seed, colOf(pos))]}, at block ${colOf(pos)}.`,
    `This session: ${w.tools} tools, ${w.explosions} creeper explosions, current error-free streak ${w.streak}.`,
  ]
  if (l) {
    lines.push(`All time: ${l.tools} tools, ${l.fish} fish, ${l.reads} reads, ${l.explosions} explosions, ${l.nights} nights.`)
  }
  lines.push(`Advancements (${got.length}/${ids.length}):`)
  for (const id of ids) {
    const a = ACHIEVEMENTS[id]
    lines.push(`  ${got.includes(id) ? '✓' : '·'} ${a.name}: ${a.desc}`)
  }

  return lines.join('\n')
}

const HELP = [
  'ClawdCraft commands:',
  '  /mc          switch between the band and the side pane',
  '  /mc band     show the world in a band above the prompt',
  '  /mc pane     show the world in a side pane',
  '  /mc hide     hide it',
  '  /mc stats    the journey so far and advancements',
  '  /mc demo     play every animation in turn',
  '  /mc new      start a new world from a new seed',
].join('\n')

const C = (kind: ActivityKind, success?: Classified['success'], tag?: Classified['tag']): Classified => ({
  kind,
  success,
  tag,
})

function stopDemo() {
  for (const timer of demo) {
    timer.cancel()
  }
  if (demo.length > 0) {
    io?.status(undefined)
  }
  demo = []
}

const DEMO: [number, string, (w: WorldState, now: number) => WorldState | null][] = [
  [0, 'Claude thinks: Clawd mines the block ahead', (w, t) => turnStart(w, t)],
  [2600, 'the thought ends: the block breaks, Clawd walks on', (w, t) => setActivity(w, 'walk', t)],
  [3500, 'WebFetch: fetching data = fishing', (w, t) => startTool(w, 'demo-1', C('fish'), t)],
  [6500, 'caught a fish!', (w, t) => endTool(w, 'demo-1', C('fish', 'catch'), 'ok', t)],
  [6800, 'thinking again: a new block', (w, t) => setActivity(w, 'think', t)],
  [8000, 'Grep: searching = mining', (w, t) => startTool(w, 'demo-2', C('mine'), t)],
  [10500, 'found a diamond!', (w, t) => endTool(w, 'demo-2', C('mine', 'diamond'), 'ok', t)],
  [11500, 'Read: reading a file = a book on the lectern', (w, t) => startTool(w, 'demo-3', C('read'), t)],
  [
    13500,
    'Edit: editing = the crafting table',
    (w, t) => startTool(endTool(w, 'demo-3', C('read'), 'ok', t), 'demo-4', C('craft'), t),
  ],
  [16000, 'item crafted', (w, t) => endTool(w, 'demo-4', C('craft', 'item'), 'ok', t)],
  [16500, 'Write: a new file = placing a block', (w, t) => startTool(w, 'demo-5', C('build'), t)],
  [
    18000,
    'one more block',
    (w, t) => startTool(endTool(w, 'demo-5', C('build', 'block'), 'ok', t), 'demo-6', C('build'), t),
  ],
  [19500, 'the build grows', (w, t) => endTool(w, 'demo-6', C('build', 'block'), 'ok', t)],
  [20000, 'Bash: a command = the furnace', (w, t) => startTool(w, 'demo-7', C('smelt'), t)],
  [23000, 'command done', (w, t) => endTool(w, 'demo-7', C('smelt'), 'ok', t)],
  [23500, 'Skill: the enchanting table', (w, t) => startTool(w, 'demo-8', C('magic'), t)],
  [26500, 'spell cast!', (w, t) => endTool(w, 'demo-8', C('magic', 'sparkle'), 'ok', t)],
  [27000, 'Agent: a subagent = a wolf companion', (w, t) => startTool(w, 'demo-9', C('walk', undefined, 'agent'), t)],
  [28500, 'tests = arrows at a target', (w, t) => startTool(w, 'demo-10', C('test'), t)],
  [31000, 'bullseye!', (w, t) => endTool(w, 'demo-10', C('test', 'bullseye'), 'ok', t)],
  [32000, 'the wolf is done and brings a bone', (w, t) => endTool(w, 'demo-9', C('walk', undefined, 'agent'), 'ok', t)],
  [33000, 'waiting for permission', (w, t) => setActivity(w, 'wait', t)],
  [35000, 'a command failed…', (w, t) => startTool(w, 'demo-11', C('smelt'), t)],
  [35600, 'here comes a creeper!', (w, t) => endTool(w, 'demo-11', C('smelt'), 'error', t)],
  [40000, 'git push = fireworks', (w, t) => startTool(w, 'demo-12', C('rocket'), t)],
  [41500, 'launched!', (w, t) => endTool(w, 'demo-12', C('rocket', 'firework'), 'ok', t)],
  [44000, 'the turn is over, a torch goes up', (w, t) => turnEnd(w, 'answer', 30_000, t)],
  [46500, 'night falls, Clawd sleeps', (w, t) => setActivity({ ...w, idleSince: t - IDLE_NIGHT_MS - 9000 }, 'sleep', t)],
  [52000, '', () => null],
]

function runDemo() {
  stopDemo()
  const d = io
  if (!d) {
    return
  }
  for (const [at, label, step] of DEMO) {
    demo.push(
      d.after(Math.max(1, at), () => {
        d.status(label ? `ClawdCraft demo: ${label}` : undefined)
        void mutate(step)
      }),
    )
  }
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    io = {
      now: () => $.clock.now(),
      read: () => read($, world),
      write: change => update($, world, change),
      setView: v => update($, view, () => v),
      blit: async (requestId, cells, columns, rows) =>
        (await $.ui.blit({ requestId, key: RASTER_KEY, cells, columns, rows })).deny === undefined,
      toast: text => $.ui.toast(text, { timeoutMs: 6000 }),
      status: text => $.ui.status(text),
      log: text => $.ui.log(text, { to: 'debug' }),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      openPane: () => $.ui.open({ id: PANE, title: 'ClawdCraft', rows: 12 }),
      closePane: () => $.ui.close({ id: PANE }),
      after: (ms, fn) => $.clock.after(ms, fn),
    }
    try {
      await $.command.register({
        name: 'mc',
        description: "ClawdCraft: Claude's Minecraft world (band, pane, hide, stats, demo)",
        argumentHint: '[band|pane|hide|stats|demo|new]',
      })
    } catch (err) {
      debug(err)
    }
    try {
      const stored = await $.store.get('life')
      life = life ?? asLife(stored, randomSeed())
      if (!stored) {
        await $.store.set('life', life)
      }
      const l = life
      const now = await $.clock.now()
      const current = await $.state.get(WORLD_REF)
      if (current.version === 0) {
        await mutate(() => initialWorld(l.seed, l.distance, now))
      } else {
        cache = current.value ?? null
      }
      const shown = await $.state.get(VIEW_REF)
      if (shown.version === 0) {
        const kept = await $.store.get('view')
        if (kept === 'band' || kept === 'pane' || kept === 'hidden') {
          await update($, view, () => kept)
        }
      }
      if ((await read($, view)) === 'pane') {
        void $.ui.open({ id: PANE, title: 'ClawdCraft', rows: 12 }).catch(debug)
      }
    } catch (err) {
      debug(err)
    }
    $.clock.every(FRAME_MS, () => void tick())
    $.clock.every(2000, () => void housekeep())

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    try {
      await saveLife(0)
    } catch (err) {
      debug(err)
    }

    return next(e)
  })

  on('turn.start', ($, e, next) => {
    stopDemo()
    void mutate((w, now) => turnStart(w, now))

    return next(e)
  })

  // Each model request is a thought: Clawd mines one block from the moment it is sent
  // until the answer's first words, when the block breaks and he walks on.
  on('turn.step', async function* ($, e, next) {
    const stream = next(e)
    if (e.agentId !== undefined) {
      return yield* stream
    }
    void mutate((w, now) =>
      !w.isWorking || w.running.length > 0 || w.activity === 'think' || w.activity === 'hurt'
        ? null
        : setActivity(w, 'think', now),
    )
    let isWriting = false
    for await (const chunk of stream) {
      if (!isWriting && chunk.kind === 'text') {
        isWriting = true
        void mutate((w, now) => (w.activity === 'think' ? setActivity(w, 'walk', now) : null))
      }
      yield chunk
    }

    return await stream.result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const w = cache
      if (w && w.wolves.length > 0) {
        void mutate((cur, now) => (now - cur.wolfBusyAt > 1200 ? { ...cur, wolfBusyAt: now } : null))
      }

      return next(e)
    }
    let cls: Classified = { kind: 'craft' }
    try {
      cls = classify(e.tool, e as unknown as Record<string, unknown>)
      onToolStart(cls)
    } catch (err) {
      debug(err)
    }
    const id = e.tool_use_id
    void mutate((w, now) => startTool(w, id, cls, now))
    const ran = await next(e)
    const outcome: Outcome = ran.deny !== undefined ? 'denied' : ran.isError === true ? 'error' : 'ok'
    try {
      onToolEnd(cls, outcome)
    } catch (err) {
      debug(err)
    }
    void mutate((w, now) => endTool(w, id, cls, outcome, now))

    return ran
  })

  on('classic.PermissionRequest', ($, e, next) => {
    void mutate((w, now) => (w.activity === 'wait' ? null : setActivity(w, 'wait', now)))

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      const reason = e.reason
      const duration = e.durationMs
      if (reason === 'error') {
        onExplosion()
      }
      void mutate((w, now) => turnEnd(w, reason, duration, now))
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }
    void mutate((w, now) => setActivity(w, 'compost', now))
    const done = await next(e)
    void mutate((w, now) => (w.activity === 'compost' ? setActivity(w, w.isWorking ? 'walk' : 'idle', now) : null))

    return done
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin === 'person') {
      await update($, view, () => 'band')
      await $.store.set('view', 'band')
    }

    return next(e)
  })

  on('command.run', { command: 'mc' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, view)
    switch (arg) {
      case '':
        await setView(current === 'pane' ? 'band' : 'pane')
        return { text: current === 'pane' ? 'ClawdCraft moved to the band.' : 'ClawdCraft opened in a pane.' }
      case 'band':
        await setView('band')
        return { text: 'ClawdCraft is above the prompt.' }
      case 'pane':
        await setView('pane')
        return { text: 'ClawdCraft opened in a pane.' }
      case 'hide':
        await setView('hidden')
        return { text: 'ClawdCraft is hidden. Bring it back with /mc band.' }
      case 'stats':
        return { text: stats(await read($, world), await $.clock.now()) }
      case 'demo':
        if (current === 'hidden') {
          await setView('band')
        }
        runDemo()
        return {
          text: 'Demo started: for about 50 seconds every animation plays in turn. The status line says which one is playing.',
        }
      case 'new': {
        const seed = randomSeed()
        counted(l => {
          l.seed = seed
          l.distance = 0
        })
        await mutate((_, now) => initialWorld(seed, 0, now))
        return { text: 'A new world has been created.' }
      }
      default:
        return { text: HELP }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, view)) !== 'band') {
      return next(e)
    }
    const w = await read($, world)
    cache = w
    const now = await $.clock.now()
    if (e.surface === 'terminal') {
      return terminalTree($.ui.resolve(e), rasterProps(w, now, e.requestId, e.props.bodyColumns, e.props.maxRows, true))
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg {...svgProps(w, now, e.props.bodyColumns, true)} />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const w = await read($, world)
    cache = w
    const now = await $.clock.now()
    if (e.surface === 'terminal') {
      return terminalTree(
        $.ui.resolve(e),
        rasterProps(w, now, e.requestId, e.props.bodyColumns, e.props.scroll.bodyRows, false),
      )
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg {...svgProps(w, now, e.props.bodyColumns, false)} />
  })
}
