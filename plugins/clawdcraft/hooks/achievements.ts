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
  'stone-age': { name: 'Taş Devri', desc: 'İlk aracını kullandın' },
  'gone-fishing': { name: 'Balık Tutmaya Gittik', desc: 'İlk veriyi çektin' },
  'aw-man': { name: 'Aw Man', desc: 'İlk creeper patlaması' },
  diamonds: { name: 'Elmas!', desc: 'Bir oturumda 50 araç' },
  apprentice: { name: 'Büyücü Çırağı', desc: 'İlk Skill büyüsü' },
  'best-friend': { name: 'Sadık Dost', desc: 'İlk kurt yoldaş (subagent)' },
  pack: { name: 'Kurt Sürüsü', desc: 'Aynı anda 3 kurt' },
  fireworks: { name: 'Havai Fişek', desc: 'İlk git push' },
  'long-road': { name: 'Uzun Yol', desc: 'Toplam 1000 blok yürüdün' },
  nether: { name: "Nether'e Hoş Geldin", desc: 'Nether biyomuna ulaştın' },
  'sweet-dreams': { name: 'İyi Uykular', desc: 'İlk gece uykusu' },
  survivor: { name: 'Hayatta Kalan', desc: '25 araç üst üste hatasız' },
  'creeper-hunter': { name: 'Creeper Avcısı', desc: 'Toplam 10 patlama' },
  bookworm: { name: 'Kitap Kurdu', desc: 'Toplam 100 dosya okudun' },
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

  return `🏆 Başarım kazanıldı! ${a.name}: ${a.desc}`
}
