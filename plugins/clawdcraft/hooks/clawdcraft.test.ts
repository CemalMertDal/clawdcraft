import { describe, expect, mock, test } from 'claude-code/testing'

import type { ActivityKind, WorldState } from '../types'
import { classify } from './activity'
import { base64, downsample2, packCells, rasterize } from './render-raster'
import { renderSvg } from './render-svg'
import { composeScene, crackStage } from './scene'
import { RAW_NAMES, hasColor, rawRows } from './sprites'
import {
  BLOCK,
  HURT_MS,
  IDLE_NIGHT_MS,
  buildTerrain,
  cameraAt,
  markIndex,
  wallAt,
  endTool,
  goSleep,
  initialWorld,
  layoutFor,
  posAt,
  recover,
  setActivity,
  startTool,
  turnEnd,
  turnStart,
} from './world'

const SVG_LIMIT = 131072
const T0 = 1_000_000

const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11

/** A world with every kind of thing in it at once. */
function busyWorld(now: number): WorldState {
  let w = turnStart(initialWorld(99, 4000, now - 20_000), now - 20_000)
  const kinds: ActivityKind[] = ['fish', 'read', 'craft', 'build', 'smelt', 'test', 'chest', 'magic', 'plan', 'compost']
  kinds.forEach((kind, i) => {
    const t = now - 19_000 + i * 1000
    w = startTool(w, `t${i}`, { kind }, t)
    w = endTool(w, `t${i}`, { kind }, 'ok', t + 500)
    w = setActivity(w, 'walk', t + 600)
  })
  w = startTool(w, 'a1', classify('Agent', {}), now - 3000)
  w = startTool(w, 'a2', classify('Agent', {}), now - 2900)
  w = endTool(w, 'x', classify('Bash', { command: 'false' }), 'error', now - 1000)
  for (const kind of ['catch', 'diamond', 'item', 'block', 'bullseye', 'firework', 'sparkle', 'pearl', 'flag', 'bone'] as const) {
    w = { ...w, effects: [...w.effects, { kind, at: now - 300, x: posAt(w, now) + 20 }] }
  }

  return w
}

describe('sprites', () => {
  test('every sprite is a rectangle of known colors', () => {
    for (const name of RAW_NAMES) {
      const rows = rawRows(name)
      const width = rows[0]?.length ?? 0
      expect(`${name}:${width > 0}`).toBe(`${name}:true`)
      for (const row of rows) {
        expect(`${name}:${row.length}`).toBe(`${name}:${width}`)
        for (const ch of row) {
          expect(`${name}:${ch}:${hasColor(ch)}`).toBe(`${name}:${ch}:true`)
        }
      }
    }
  })
})

describe('activities', () => {
  test('tools map to what Clawd does', () => {
    expect(classify('WebFetch', {}).kind).toBe('fish')
    expect(classify('WebSearch', {}).kind).toBe('fish')
    expect(classify('mcp__github__get_issue', {}).kind).toBe('fish')
    expect(classify('Grep', {}).kind).toBe('mine')
    expect(classify('Glob', {}).kind).toBe('mine')
    expect(classify('Read', {}).kind).toBe('read')
    expect(classify('Edit', {}).kind).toBe('craft')
    expect(classify('Write', {}).kind).toBe('build')
    expect(classify('Skill', {}).kind).toBe('magic')
    expect(classify('TodoWrite', {}).kind).toBe('plan')
    expect(classify('Agent', {}).tag).toBe('agent')
    expect(classify('Bash', { command: 'git push origin main' }).kind).toBe('rocket')
    expect(classify('Bash', { command: 'git commit -m "x"' }).kind).toBe('chest')
    expect(classify('Bash', { command: 'npm test' }).kind).toBe('test')
    expect(classify('Bash', { command: 'pytest -q' }).kind).toBe('test')
    expect(classify('Bash', { command: 'curl -s https://example.com' }).kind).toBe('fish')
    expect(classify('Bash', { command: 'ls -la' }).kind).toBe('mine')
    expect(classify('Bash', { command: 'cat README.md' }).kind).toBe('read')
    expect(classify('Bash', { command: 'make build' }).kind).toBe('smelt')
    expect(classify('PowerShell', { command: 'Get-ChildItem' }).kind).toBe('mine')
  })
})

describe('world', () => {
  test('the same seed grows the same world, another seed another', () => {
    const L = layoutFor(200, 48)
    const a = JSON.stringify(buildTerrain(42, L, -10, 600, new Map()))
    expect(JSON.stringify(buildTerrain(42, L, -10, 600, new Map()))).toBe(a)
    expect(JSON.stringify(buildTerrain(43, L, -10, 600, new Map())) === a).toBe(false)
  })

  test('the world is one flat plane, craters included', () => {
    let w = turnStart(initialWorld(11, 0, T0), T0)
    w = endTool(startTool(w, 't', classify('Bash', { command: 'x' }), T0), 't', classify('Bash', { command: 'x' }), 'error', T0 + 10)
    for (const H of [20, 48, 64]) {
      const L = layoutFor(300, H)
      const { tiles } = buildTerrain(11, L, -40, 900, markIndex(w.marks, T0 + 10_000))
      // Every column's rows start at groundBase and step down a block at a time.
      const rows = [...new Set(tiles.map(t => t.y))].sort((a, b) => a - b)
      expect(rows[0]).toBe(L.groundBase)
      rows.forEach((y, i) => expect(y).toBe(L.groundBase + i * BLOCK))
    }
  })

  test('below the grass and dirt lies stone, with ores in it', () => {
    const L = layoutFor(300, 64)
    const { tiles } = buildTerrain(5, L, 0, 400, new Map())
    const deep = tiles.filter(t => t.y >= L.groundBase + 2 * BLOCK).map(t => t.tex)
    expect(deep.includes('tex_stone')).toBe(true)
    expect(deep.some(t => t === 'tex_coal' || t === 'tex_iron' || t === 'tex_gold' || t === 'tex_ore')).toBe(true)
  })

  test('one thought mines one block: Clawd stands, and the block breaks when it ends', () => {
    let w = turnStart(initialWorld(9, 0, T0), T0)
    expect(w.activity).toBe('think')
    expect(w.speed).toBe(0)
    const block = w.anchor
    expect(block * BLOCK > posAt(w, T0) + 6).toBe(true)
    w = setActivity(w, 'walk', T0 + 20_000)
    expect(w.effects.some(e => e.kind === 'break' && Math.floor(e.x / BLOCK) === block)).toBe(true)
    expect(w.speed > 0).toBe(true)
    // A tool stops him; a new thought picks a new block further on.
    w = startTool(w, 'r', classify('Read', {}), T0 + 22_000)
    expect(w.speed).toBe(0)
    w = endTool(w, 'r', classify('Read', {}), 'ok', T0 + 22_500)
    expect(w.activity).toBe('walk')
    w = setActivity(w, 'think', T0 + 23_000)
    expect(w.anchor > block).toBe(true)
  })

  test('cracks grow with the thought, fast then slow, and hold before the break', () => {
    const stages = [0, 1000, 3000, 6000, 15_000, 60_000, 3_600_000].map(crackStage)
    stages.forEach((s, i) => expect(s >= (stages[i - 1] ?? 0)).toBe(true))
    expect(crackStage(6000)).toBe(5)
    expect(crackStage(3_600_000)).toBe(9)
    expect(crackStage(500) < 2).toBe(true)
  })

  test('the block mined at a column is the same every time', () => {
    for (let i = 0; i < 200; i++) {
      expect(wallAt(3, i)).toBe(wallAt(3, i))
    }
  })

  test('the camera never moves back, and Clawd holds his spot on screen', () => {
    // A turn's worth of walking, stopping for tools, a creeper, and walking on.
    let w = turnStart(initialWorld(21, 0, T0), T0)
    const plan: [number, (w: WorldState, t: number) => WorldState][] = [
      [9000, (x, t) => startTool(x, 'a', classify('Read', {}), t)],
      [9400, (x, t) => endTool(x, 'a', classify('Read', {}), 'ok', t)],
      [17_000, (x, t) => startTool(x, 'b', classify('Bash', { command: 'x' }), t)],
      [17_700, (x, t) => endTool(x, 'b', classify('Bash', { command: 'x' }), 'error', t)],
      [20_800, (x, t) => recover(x, t) ?? x],
      [33_000, (x, t) => startTool(x, 'c', classify('Grep', {}), t)],
      [33_050, (x, t) => endTool(x, 'c', classify('Grep', {}), 'ok', t)],
    ]
    for (const W of [100, 307, 600]) {
      const L = layoutFor(W, 48)
      let world = w
      let step = 0
      let prev = Number.NEGATIVE_INFINITY
      for (let t = T0; t <= T0 + 60_000; t += 50) {
        while (step < plan.length && T0 + (plan[step]?.[0] ?? 0) <= t) {
          world = plan[step]?.[1](world, t) ?? world
          step++
        }
        const cam = cameraAt(world, t, L)
        expect(`${W}@${t - T0}: ${cam >= prev - 1e-6}`).toBe(`${W}@${t - T0}: true`)
        expect(`${W}@${t - T0}: ${Math.abs(posAt(world, t) - cam - L.lo) < 1e-6}`).toBe(`${W}@${t - T0}: true`)
        prev = cam
      }
    }
  })

  test('the drawn glide puts the world under Clawd where he really is', () => {
    const w = setActivity(turnStart(initialWorld(4, 777, T0), T0), 'walk', T0)
    const now = T0 + 5000
    const scene = composeScene(w, now, 300, 48, 120_000)
    const clawd = scene.actors.find(a => a.frames?.includes('clawd_step'))
    const camera = scene.camera
    expect(camera !== undefined && clawd !== undefined && clawd.motion === undefined).toBe(true)
    if (!camera || !clawd) {
      return
    }
    for (const key of camera.keys) {
      const t = now + key.p * camera.dur
      expect(Math.abs(-key.x + clawd.x + 6 - posAt(w, t)) < 0.01).toBe(true)
    }
    // Standing still, nothing glides.
    const still = startTool(w, 'r', classify('Read', {}), now)
    expect(composeScene(still, now + 100, 300, 48, 120_000).camera).toBe(undefined)
  })

  test('walking moves Clawd and work stops him', () => {
    let w = turnStart(initialWorld(1, 0, T0), T0)
    w = setActivity(w, 'walk', T0)
    expect(posAt(w, T0 + 2000)).toBe(24)
    w = startTool(w, 't', classify('Grep', {}), T0 + 2000)
    expect(posAt(w, T0 + 9000)).toBe(24)
    w = endTool(w, 't', classify('Grep', {}), 'ok', T0 + 9000)
    expect(w.activity).toBe('walk')
    expect(w.effects.some(e => e.kind === 'diamond')).toBe(true)
  })

  test('an error brings a creeper, a crater, and a pause', () => {
    const bash = classify('Bash', { command: 'false' })
    let w = turnStart(initialWorld(7, 0, T0), T0)
    w = startTool(w, 't1', bash, T0 + 500)
    expect(w.activity).toBe('smelt')
    w = endTool(w, 't1', bash, 'error', T0 + 1000)
    expect(w.activity).toBe('hurt')
    expect(w.effects.some(e => e.kind === 'explode')).toBe(true)
    expect(w.marks.some(m => m.kind === 'crater')).toBe(true)
    w = startTool(w, 't2', classify('Read', {}), T0 + 1500)
    expect(w.activity).toBe('hurt')
    expect(recover(w, T0 + 1600)).toBe(null)
    expect(recover(w, T0 + 1000 + HURT_MS)?.activity).toBe('read')
  })

  test('subagents come as wolves and leave with a bone', () => {
    const agent = classify('Agent', {})
    let w = turnStart(initialWorld(3, 0, T0), T0)
    w = startTool(w, 'a', agent, T0 + 100)
    expect(w.wolves.length).toBe(1)
    expect(w.activity).toBe('idle')
    expect(w.speed).toBe(0)
    w = endTool(w, 'a', agent, 'ok', T0 + 5000)
    expect(w.wolves[0]?.leftAt).toBe(T0 + 5000)
    expect(w.effects.some(e => e.kind === 'bone')).toBe(true)
  })

  test('an idle Clawd sleeps at night and wakes at sunrise', () => {
    let w = turnEnd(turnStart(initialWorld(5, 0, T0), T0), 'answer', 1000, T0 + 1000)
    expect(w.marks.some(m => m.kind === 'torch')).toBe(true)
    expect(goSleep(w, T0 + 2000)).toBe(null)
    const asleep = goSleep(w, T0 + 1000 + IDLE_NIGHT_MS)
    expect(asleep?.activity).toBe('sleep')
    w = turnStart(asleep ?? w, T0 + 1000 + IDLE_NIGHT_MS + 20_000)
    expect(w.effects.some(e => e.kind === 'sunrise')).toBe(true)
    expect(w.dayAt).toBe(0.02)
  })
})

describe('renderers', () => {
  test('the vector scene stays under the Svg limit in every activity', () => {
    const base = busyWorld(T0)
    const kinds: ActivityKind[] = ['idle', 'walk', 'think', 'fish', 'mine', 'read', 'craft', 'build', 'smelt', 'test', 'chest', 'rocket', 'magic', 'plan', 'wait', 'compost', 'hurt', 'sleep']
    for (const kind of kinds) {
      const w = setActivity(base, kind, T0)
      for (const [W, H] of [[800, 64], [800, 48], [80, 48]] as const) {
        const svg = renderSvg(composeScene(w, T0 + 100, W, H, 60_000), T0 + 100, { scale: 3 })
        expect(svg.startsWith('<svg')).toBe(true)
        expect(`${kind}:${W}x${H}:${svg.length < SVG_LIMIT}`).toBe(`${kind}:${W}x${H}:true`)
      }
    }
  })

  test('cells pack to the Raster size', () => {
    const w = busyWorld(T0)
    for (const [columns, rows] of [[120, 10], [37, 4], [512, 32]] as const) {
      const H = rows * 2
      const buf = rasterize(composeScene(w, T0, columns, H, 0), T0)
      expect(buf.length).toBe(columns * H)
      expect(packCells(buf, columns, H, columns, rows).length).toBe(Math.ceil((columns * rows * 12) / 3) * 4)
    }
  })

  test('halving keeps eyes, stars and lines, and drops nothing to the sky', () => {
    const SKY = 0x6fa8ff
    const ORANGE = 0xd97757
    const BLACK = 0x1b1b1b
    const STAR = 0xffffff
    // Three 2x2 blocks side by side: an eye beside a cheek, one star in the sky, plain sky.
    const W = 6
    const buf = Uint32Array.from([ORANGE, BLACK, SKY, SKY, SKY, SKY, ORANGE, BLACK, SKY, STAR, SKY, SKY])
    const mask = Uint8Array.from([1, 1, 0, 0, 0, 0, 1, 1, 0, 1, 0, 0])
    expect([...downsample2(buf, mask, W, 2)]).toEqual([BLACK, STAR, SKY])
  })

  test('the terminal can dim the ground and leave Clawd as he is', () => {
    const w = turnStart(initialWorld(8, 0, T0), T0)
    const scene = composeScene(w, T0, 120, 24, 0)
    const bright = rasterize(scene, T0)
    const dim = rasterize(scene, T0, { groundShade: 0.5 })
    const groundRow = layoutFor(120, 24).groundBase + 2
    const i = groundRow * 120 + 3
    expect(luma(dim[i] ?? 0) < luma(bright[i] ?? 0)).toBe(true)
    const clawdColor = 0xd97757
    expect([...bright].filter(c => c === clawdColor).length).toBe([...dim].filter(c => c === clawdColor).length)
  })

  test('base64 encodes as the standard does', () => {
    expect(base64(new Uint8Array([1, 2, 3, 4]))).toBe('AQIDBA==')
    expect(base64(new Uint8Array([255, 254]))).toBe('//4=')
  })
})

const bandProps = (bodyColumns: number) => ({
  hasSurvey: false,
  isWorking: true,
  maxRows: 14,
  bodyColumns,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

describe('in a session', () => {
  test('the band draws a Raster on the terminal and an Svg on the desktop', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    mock.store(on)
    on('session.start', () => ({ cwd: '/' }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await clock.settle()
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await clock.settle()
    const t = await $.ui.mount({ plugin: 'clawdcraft', surface: 'terminal', component: 'AbovePrompt', props: bandProps(100) })
    expect(await t.find({ type: 'Raster' })).toBeDefined()
    // A turn just began, so Clawd is thinking: his tag is drawn over the world.
    expect((await t.find({ type: 'Text', text: /thinking/ })) === undefined).toBe(false)
    await t.unmount()
    const d = await $.ui.mount({ plugin: 'clawdcraft', surface: 'desktop', component: 'AbovePrompt', props: bandProps(120) })
    expect((await d.drawn()).type).toBe('Svg')
    await d.unmount()
  })

  test('a failing command brings the creeper', async ($, on) => {
    const clock = mock.clock(on, { now: T0 })
    const logs: string[] = []
    mock.store(on)
    on('session.start', () => ({ cwd: '/' }))
    on('ui.log', ($, e) => {
      logs.push(e.text)
      return { value: undefined }
    })
    on('ui.toast', () => ({ value: undefined }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('tool.call', () => ({ result: { stdout: '', stderr: 'nope', interrupted: false }, text: 'nope', isError: true }))
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    await clock.settle()
    await $.tool.call({ tool: 'Bash', command: 'false' })
    await clock.settle()
    const d = await $.ui.mount({ plugin: 'clawdcraft', surface: 'desktop', component: 'AbovePrompt', props: bandProps(120) })
    const drawn = JSON.stringify(await d.drawn())
    expect(drawn).toContain('recovering from a creeper')
    expect(drawn).toContain('creeper_flash')
    expect(logs).toEqual([])
  })
})
