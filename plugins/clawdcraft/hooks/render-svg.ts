// The desktop's renderer: the scene as one SVG whose CSS animations play it
// forward by themselves. Every animation is delayed by how long ago it
// started (negative), so a redraw resumes it instead of restarting it.

import type { Actor, Motion, Scene } from './scene'
import type { SpriteName, TextureName } from './sprites'
import { hex, sprite } from './sprites'

export type SvgOptions = {
  /** CSS pixels per world pixel. */
  scale: number
  /** Draw sprites in place rather than through `<use>`. */
  isInline?: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (p: number) => `${r2(p * 100)}%`

/** A sprite's pixels as one path per color. */
function paths(name: SpriteName): string {
  const s = sprite(name)
  const byColor = new Map<number, string[]>()
  for (let y = 0; y < s.h; y++) {
    let x = 0
    while (x < s.w) {
      const c = s.px[y * s.w + x] ?? -1
      let end = x + 1
      while (end < s.w && (s.px[y * s.w + end] ?? -1) === c) {
        end++
      }
      if (c >= 0) {
        const runs = byColor.get(c)
        const run = `M${x} ${y}h${end - x}v1h-${end - x}z`
        if (runs) {
          runs.push(run)
        } else {
          byColor.set(c, [run])
        }
      }
      x = end
    }
  }

  return [...byColor].map(([c, runs]) => `<path fill="${hex(c)}" d="${runs.join('')}"/>`).join('')
}

/** Each drawing names its ids and classes apart, should two share a page. */
let drawings = 0

export function renderSvg(scene: Scene, now: number, opts: SvgOptions): string {
  const { W, H } = scene
  const ns = `c${(drawings++ % 46656).toString(36)}`
  const css: string[] = []
  const kfDone = new Set<string>()
  const textures = new Set<TextureName>()
  const sprites = new Set<SpriteName>()
  let next = 0

  const animate = (m: Motion): string => {
    const name = `${ns}m${next++}`
    const frames = m.keys.map(key => `${pct(key.p)}{transform:translate(${r2(key.x)}px,${r2(key.y)}px);opacity:${r2(key.o)}}`)
    const elapsed = now - m.start
    const delay = m.loop ? -(((elapsed % m.dur) + m.dur) % m.dur) : -elapsed
    css.push(
      `@keyframes ${name}{${frames.join('')}}`,
      `.${name}{animation:${name} ${Math.round(m.dur)}ms linear ${Math.round(delay)}ms ${m.loop ? 'infinite' : '1'} both}`,
    )

    return name
  }

  // One class per motion: Clawd, his bubble and his wolves share one walk.
  const named = new Map<Motion, string>()
  const animateOnce = (m: Motion): string => {
    const hit = named.get(m)
    if (hit) {
      return hit
    }
    const name = animate(m)
    named.set(m, name)

    return name
  }

  const draw = (a: Actor, name: SpriteName): string => {
    sprites.add(name)
    const body = opts.isInline ? paths(name) : `<use href="#${ns}s_${name}"/>`

    return a.flip ? `<g transform="translate(${sprite(name).w},0) scale(-1,1)">${body}</g>` : body
  }

  const frames = (a: Actor): string => {
    const list = a.frames ?? []
    const first = list[0]
    if (!first) {
      return ''
    }
    if (list.length === 1 || !a.fps) {
      return draw(a, first)
    }
    const n = list.length
    const period = (n / a.fps) * 1000
    const isLoop = a.frameLoop !== false
    const elapsed = now - (a.frameStart ?? 0)
    const delay = isLoop ? -(((elapsed % period) + period) % period) : -elapsed
    const segments: { name: SpriteName; from: number; to: number }[] = []
    list.forEach((name, i) => {
      const last = segments[segments.length - 1]
      if (last && last.name === name) {
        last.to = (i + 1) / n
      } else {
        segments.push({ name, from: i / n, to: (i + 1) / n })
      }
    })

    return segments
      .map(seg => {
        const kf = `${ns}v${Math.round(seg.from * 1000)}_${Math.round(seg.to * 1000)}`
        if (!kfDone.has(kf)) {
          kfDone.add(kf)
          const steps = [
            seg.from > 0 ? '0%{opacity:0}' : '',
            `${pct(seg.from)}{opacity:1}`,
            seg.to < 1 ? `${pct(seg.to)}{opacity:0}` : '',
            `100%{opacity:${seg.to >= 1 ? 1 : 0}}`,
          ]
          css.push(`@keyframes ${kf}{${steps.join('')}}`)
        }
        const cls = `${ns}f${next++}`
        css.push(
          `.${cls}{animation:${kf} ${Math.round(period)}ms step-end ${Math.round(delay)}ms ${isLoop ? 'infinite' : '1'} both}`,
        )

        return `<g class="${cls}">${draw(a, seg.name)}</g>`
      })
      .join('')
  }

  const actor = (a: Actor): string => {
    let inner = a.rect
      ? `<rect width="${r2(a.rect.w)}" height="${r2(a.rect.h)}" fill="${hex(a.rect.color)}"/>`
      : frames(a)
    if (!inner) {
      return ''
    }
    if (a.motion) {
      inner = `<g class="${animateOnce(a.motion)}">${inner}</g>`
    }

    return `<g transform="translate(${r2(a.x)},${r2(a.y)})">${inner}</g>`
  }

  // The camera: still, or with the pans the walk ahead will make.
  const openCam = scene.camera
    ? `<g class="${animateOnce(scene.camera)}">`
    : `<g transform="translate(${r2(-scene.camX)},0)">`

  const tile = (t: { x: number; y: number; w: number; h: number; tex: TextureName }) => {
    textures.add(t.tex)

    return `<rect x="${t.x}" y="${t.y}" width="${t.w}" height="${t.h}" fill="url(#${ns}t_${t.tex})"/>`
  }

  const body: string[] = []
  const actors = scene.actors
  let i = 0
  for (; i < actors.length && (actors[i]?.z ?? 0) < 10; i++) {
    const a = actors[i]
    if (a) {
      body.push(actor(a))
    }
  }
  body.push(openCam, ...scene.tiles.map(tile), ...scene.structures.map(tile))
  let isInCam = true
  for (; i < actors.length; i++) {
    const a = actors[i]
    if (!a) {
      continue
    }
    const wantsCam = a.space === 'world'
    if (wantsCam !== isInCam) {
      body.push(wantsCam ? openCam : '</g>')
      isInCam = wantsCam
    }
    body.push(actor(a))
  }
  if (isInCam) {
    body.push('</g>')
  }

  const defs: string[] = [
    `<linearGradient id="${ns}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hex(scene.skyTop)}"/><stop offset="1" stop-color="${hex(scene.skyBottom)}"/></linearGradient>`,
  ]
  for (const t of textures) {
    const s = sprite(t)
    defs.push(
      `<pattern id="${ns}t_${t}" width="${s.w}" height="${s.h}" patternUnits="userSpaceOnUse">${paths(t)}</pattern>`,
    )
  }
  if (!opts.isInline) {
    for (const s of sprites) {
      defs.push(`<g id="${ns}s_${s}">${paths(s)}</g>`)
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * opts.scale}" height="${H * opts.scale}" shape-rendering="crispEdges">` +
    `<defs>${defs.join('')}</defs><style>${css.join('')}</style>` +
    `<rect width="${W}" height="${H}" fill="url(#${ns}sky)"/>${body.join('')}</svg>`
  )
}
