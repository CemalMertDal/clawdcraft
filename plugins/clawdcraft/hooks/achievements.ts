export type AchievementId =
  | 'stone-age'
  | 'gone-fishing'
  | 'aw-man'
  | 'diamonds'
  | 'apprentice'
  | 'best-friend'
  | 'pack'
  | 'fireworks'
  | 'long-road'
  | 'nether'
  | 'sweet-dreams'
  | 'survivor'
  | 'creeper-hunter'
  | 'bookworm'

export const ACHIEVEMENTS: Record<AchievementId, { name: string; desc: string }> = {
  'stone-age': { name: 'Stone Age', desc: 'Used your first tool' },
  'gone-fishing': { name: 'Gone Fishing', desc: 'Fetched your first data' },
  'aw-man': { name: 'Aw Man', desc: 'Your first creeper explosion' },
  diamonds: { name: 'Diamonds!', desc: '50 tools in one session' },
  apprentice: { name: "Sorcerer's Apprentice", desc: 'Cast your first Skill' },
  'best-friend': { name: 'Best Friends Forever', desc: 'Your first wolf companion (subagent)' },
  pack: { name: 'Wolf Pack', desc: '3 wolves at once' },
  fireworks: { name: 'Fireworks', desc: 'Your first git push' },
  'long-road': { name: 'The Long Road', desc: 'Walked 1000 blocks in total' },
  nether: { name: 'Welcome to the Nether', desc: 'Reached the Nether biome' },
  'sweet-dreams': { name: 'Sweet Dreams', desc: 'Slept through your first night' },
  survivor: { name: 'Survivor', desc: '25 tools in a row without an error' },
  'creeper-hunter': { name: 'Creeper Hunter', desc: '10 explosions in total' },
  bookworm: { name: 'Bookworm', desc: 'Read 100 files in total' },
}

/** What is kept across sessions, under the store's `life` key. */
export type Life = {
  seed: number
  /** World pixels walked, all sessions. */
  distance: number
  unlocked: AchievementId[]
  tools: number
  fish: number
  reads: number
  explosions: number
  nights: number
}

export function freshLife(seed: number): Life {
  return { seed, distance: 0, unlocked: [], tools: 0, fish: 0, reads: 0, explosions: 0, nights: 0 }
}

/** Reads a stored value back as a Life, filling what an older version lacked. */
export function asLife(value: unknown, seed: number): Life {
  const base = freshLife(seed)
  if (!value || typeof value !== 'object') {
    return base
  }
  const v = value as Partial<Life>
  const num = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback)

  return {
    seed: num(v.seed, seed),
    distance: num(v.distance, 0),
    unlocked: Array.isArray(v.unlocked) ? v.unlocked.filter((id): id is AchievementId => id in ACHIEVEMENTS) : [],
    tools: num(v.tools, 0),
    fish: num(v.fish, 0),
    reads: num(v.reads, 0),
    explosions: num(v.explosions, 0),
    nights: num(v.nights, 0),
  }
}

export function toastText(id: AchievementId): string {
  const a = ACHIEVEMENTS[id]

  return `🏆 Advancement made! ${a.name}: ${a.desc}`
}
