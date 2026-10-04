export type ViewMode = 'band' | 'pane' | 'hidden'

export type ActivityKind =
  | 'idle'
  | 'walk'
  | 'think'
  | 'fish'
  | 'mine'
  | 'read'
  | 'craft'
  | 'build'
  | 'smelt'
  | 'test'
  | 'chest'
  | 'rocket'
  | 'magic'
  | 'plan'
  | 'wait'
  | 'compost'
  | 'hurt'
  | 'sleep'

export type EffectKind =
  | 'explode'
  | 'catch'
  | 'diamond'
  | 'item'
  | 'block'
  | 'bullseye'
  | 'firework'
  | 'sparkle'
  | 'pearl'
  | 'flag'
  | 'bone'
  | 'howl'
  | 'sunrise'

export type MarkKind =
  | 'pond'
  | 'lectern'
  | 'crafting'
  | 'furnace'
  | 'target'
  | 'chest'
  | 'enchant'
  | 'sign'
  | 'composter'
  | 'campfire'
  | 'torch'
  | 'crater'
  | 'plank'

/** A one-off animation, `x` in world pixels. */
export type WorldEffect = { kind: EffectKind; at: number; x: number }

/** Something left in the world at block column `i`; `h` stacks planks. */
export type WorldMark = { kind: MarkKind; i: number; at: number; h?: number }

export type RunningTool = { id: string; kind: ActivityKind; at: number }

export type Wolf = { id: string; at: number; leftAt?: number }

/**
 * Everything is stamped with times, so a drawing at any moment is
 * `render(state, now)`: position is `distanceAt + speed * (now - movedAt)`.
 */
export type WorldState = {
  seed: number
  /** World pixels walked, at `movedAt`. */
  distanceAt: number
  movedAt: number
  /** World pixels per second. */
  speed: number
  activity: ActivityKind
  activityAt: number
  /** Block column the current activity's prop stands on. */
  anchor: number
  running: RunningTool[]
  effects: WorldEffect[]
  marks: WorldMark[]
  wolves: Wolf[]
  wolfBusyAt: number
  isWorking: boolean
  idleSince: number
  /** Time of day 0..1 (0 sunrise, 0.5 sunset), at `dayMovedAt`. */
  dayAt: number
  dayMovedAt: number
  tools: number
  streak: number
  explosions: number
}

declare module 'claude-code' {
  interface PluginState {
    clawdcraft: { world: WorldState; view: ViewMode }
  }
}
