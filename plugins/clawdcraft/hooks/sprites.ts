// Pixel art, one character per pixel, '.' transparent. Every sprite and
// block texture of the world is here; both renderers decode the same data.

const PALETTE: Record<string, number> = {
  // Clawd
  o: 0xd97757, O: 0xa9502f, p: 0xeda082, K: 0x1b1b1b, W: 0xffffff,
  // creeper
  g: 0x5bae3c, G: 0x3c7a26, h: 0x8ed16b,
  // wolf
  w: 0xe8e4de, x: 0xb9b0a4, n: 0x2b2b2b, r: 0xc0392b,
  // grass and dirt
  a: 0x5da130, A: 0x47852a, b: 0x7cc35b, d: 0x8b5e3c, D: 0x6b4529, e: 0xa47550,
  // stone
  s: 0x8c8c8c, S: 0x6a6a6a, t: 0xa8a8a8,
  // sand
  y: 0xe3d59a, Y: 0xcbbb7a, z: 0xf1e7b8,
  // snow
  q: 0xf6f9ff, Q: 0xd4e2f0,
  // wood
  l: 0x6b4f2e, L: 0x4b371f, k: 0xb38b55, m: 0x8a6a3f, '7': 0x5a3a1e,
  // leaves
  f: 0x3f8a2e, F: 0x2d6b20, i: 0x58a83e,
  // birch
  u: 0xe9e5d9, U: 0x3d3d3d,
  // spruce
  j: 0x2f5e3a, J: 0x234a2c,
  // cactus
  c: 0x4f8f2c, C: 0x2f6a1b,
  // water and lava
  v: 0x3f76e4, V: 0x2e5cc2, B: 0x7aa8f5, R: 0xe0561c, T: 0xf7a338,
  // nether
  N: 0x7a2e2e, M: 0x581d1d, X: 0x9c4242, H: 0xb02a3a,
  // mycelium
  P: 0x7d6a82, Z: 0xa08db0,
  // ores, magic, fire, smoke
  E: 0x5fe3e0, '6': 0x2a9d8f, I: 0xd8af93,
  '1': 0xffd23f, '2': 0xff8c1a, '3': 0xd93a1e, '4': 0x8e44ad, '5': 0xd2a6ee,
  '8': 0xc9c9c9, '9': 0x555555, '0': 0x24202a,
}

const RAW = {
  // ---- block textures (8x8) ----
  tex_grass: [
    'abaaAaba',
    'aAabaaAa',
    'AadaAaad',
    'ddAdddAd',
    'dddDdded',
    'deddddDd',
    'dDddeddd',
    'dddDdddD',
  ],
  tex_dirt: [
    'ddeddDdd',
    'dDdddded',
    'dddDdddd',
    'eddddDdd',
    'ddDdeddd',
    'dddddddD',
    'dedDdded',
    'Dddddedd',
  ],
  tex_stone: [
    'sstsssSs',
    'sSssssss',
    'ssssStss',
    'tssSssss',
    'ssssssSs',
    'sSstssss',
    'sssssSst',
    'stsSssss',
  ],
  tex_sand: [
    'yyzyyYyy',
    'yYyyyyzy',
    'yyyyYyyy',
    'zyyyyyyY',
    'yyYyzyyy',
    'yyyyyYyy',
    'yzyYyyyz',
    'Yyyyyyyy',
  ],
  tex_sandstone: [
    'zzzzzzzz',
    'yyyyyyyy',
    'YyYYyYyY',
    'yyyyyyyy',
    'yyyyyyyy',
    'yYyyyYyy',
    'yyyyyyyy',
    'YYYYYYYY',
  ],
  tex_snow: [
    'qqqqqqqq',
    'qQqqqqQq',
    'dqdQqdqd',
    'ddddqddd',
    'dDdddded',
    'deddddDd',
    'dDddeddd',
    'dddDdddD',
  ],
  tex_mycelium: [
    'PZPPZPPZ',
    'PPZPPPZP',
    'dPdZPdPd',
    'dddPdddd',
    'dDdddded',
    'deddddDd',
    'dDddeddd',
    'dddDdddD',
  ],
  tex_nylium: [
    'HHXHHHXH',
    'HHHHXHHH',
    'NHNHNNHN',
    'NNNMNNNX',
    'NMNNNXNN',
    'NNXNNNNM',
    'MNNNMNNN',
    'NNNXNNMN',
  ],
  tex_netherrack: [
    'NNXNNMNN',
    'NMNNNNNX',
    'NNNMXNNN',
    'XNNNNNMN',
    'NNMNNXNN',
    'NNNNMNNN',
    'MNXNNNNM',
    'NNNNNXNN',
  ],
  tex_water: [
    'BvvBvvvv',
    'vvvvvBvv',
    'vVvvvvvV',
    'vvvVvvvv',
    'vvvvvvVv',
    'Vvvvvvvv',
    'vvVvvVvv',
    'vvvvvvvV',
  ],
  tex_lava: [
    'TRRTRRRR',
    'RRRRTRRT',
    'RTRRRRRR',
    'RRRRRTRR',
    'TRRRRRRT',
    'RRTRRRRR',
    'RRRRTRRR',
    'RTRRRRTR',
  ],
  tex_log: [
    'lLllLlll',
    'lLlllLll',
    'llLllLlL',
    'lLllLlll',
    'lLlllLll',
    'LllLlLll',
    'lLllLllL',
    'llLllLll',
  ],
  tex_birch: [
    'uuuuUuuu',
    'uUuuuuuu',
    'uuuuuuUU',
    'uuuuuuuu',
    'UUuuuuuu',
    'uuuuuUuu',
    'uuuuuuuu',
    'uuUUuuuu',
  ],
  tex_leaves: [
    'fFfifFff',
    'iffFffiF',
    'fFfffFff',
    'ffiFfffi',
    'Fffffiff',
    'ffFiffFf',
    'fiffFfff',
    'fFfffifF',
  ],
  tex_spruce: [
    'jJjjqjJj',
    'jjJjjjjq',
    'Jjjjjjjj',
    'jjqjJjjJ',
    'jJjjjjqj',
    'jjjJjjjj',
    'qjjjjJjj',
    'jJjjjjjJ',
  ],
  tex_cactus: [
    'CcCccCcC',
    'CcccccCC',
    'cccCcccc',
    'CccccccC',
    'CcCcccCC',
    'ccccCccc',
    'CccccccC',
    'CcccCcCc',
  ],
  tex_plank: [
    'kkkkkkkm',
    'kmkkkkkk',
    'mmmmmmmm',
    'kkkmkkkk',
    'kkkkkkkm',
    'mmmmmmmm',
    'kkkkkmkk',
    'mkkkkkkk',
  ],
  tex_cap: [
    '33W33333',
    '3333W333',
    'W3333333',
    '333W33W3',
    '33333333',
    '3W33333W',
    '3333W333',
    '33333333',
  ],
  tex_stem: [
    'uuuuuuuu',
    'uuQuuuuu',
    'uuuuuuQu',
    'uuuuuuuu',
    'uQuuuuuu',
    'uuuuQuuu',
    'uuuuuuuu',
    'uuuQuuuu',
  ],
  tex_coal: [
    'sstsssSs',
    'sKKsssss',
    'sKKsSKss',
    'tssSsKKs',
    'ssssssSs',
    'sSKKssss',
    'ssKKsSst',
    'stsSssss',
  ],
  tex_iron: [
    'sstsssSs',
    'sIIsssss',
    'sIesSIss',
    'tssSsIIs',
    'ssssssSs',
    'sSIIssss',
    'ssIesSst',
    'stsSssss',
  ],
  tex_gold: [
    'sstsssSs',
    's11sssss',
    's1zsS1ss',
    'tssSs11s',
    'ssssssSs',
    'sS11ssss',
    'ss1zsSst',
    'stsSssss',
  ],
  tex_crater: [
    '0D9dD90D',
    'D9DdD0dD',
    'dDdD9dDd',
    'ddDdeddd',
    'dDdddDdd',
    'deddddDd',
    'dDddeddd',
    'dddDdddD',
  ],
  tex_ore: [
    'sstsssSs',
    'sEEsssss',
    'sEWsSEss',
    'tssSsEEs',
    'ssssssSs',
    'sSEEssss',
    'ssEWsSst',
    'stsSssss',
  ],

  // ---- Clawd (12x10) ----
  clawd_idle: [
    '..oooooooo..',
    '..oooooooo..',
    '..oKooooKo..',
    '..oKooooKo..',
    'oooooooooooo',
    'oooooooooooo',
    '..oooooooo..',
    '..OOOOOOOO..',
    '..o.o..o.o..',
    '..o.o..o.o..',
  ],
  clawd_step: [
    '..oooooooo..',
    '..oooooooo..',
    '..oKooooKo..',
    '..oKooooKo..',
    'oooooooooooo',
    'oooooooooooo',
    '..oooooooo..',
    '..OOOOOOOO..',
    '..o.o..o.o..',
    '....o....o..',
  ],
  clawd_blink: [
    '..oooooooo..',
    '..oooooooo..',
    '..oooooooo..',
    '..oKooooKo..',
    'oooooooooooo',
    'oooooooooooo',
    '..oooooooo..',
    '..OOOOOOOO..',
    '..o.o..o.o..',
    '..o.o..o.o..',
  ],
  clawd_cheer: [
    'o.oooooooo.o',
    'oooooooooooo',
    '..oKooooKo..',
    '..oKooooKo..',
    '..oooooooo..',
    '..oooooooo..',
    '..oooooooo..',
    '..OOOOOOOO..',
    '..o.o..o.o..',
    '..o.o..o.o..',
  ],
  clawd_sleep: [
    '............',
    '............',
    '............',
    '..oooooooo..',
    '..oKKooKKo..',
    'oooooooooooo',
    'oooooooooooo',
    '..oooooooo..',
    '..OOOOOOOO..',
    '.OO......OO.',
  ],

  // ---- Clawd for the terminal (9x7): drawn at its own size, not halved ----
  mini_clawd_idle: [
    '.ooooooo.',
    '.oKoooKo.',
    '.oKoooKo.',
    'ooooooooo',
    '.ooooooo.',
    '.OOOOOOO.',
    '.o.o.o.o.',
  ],
  mini_clawd_step: [
    '.ooooooo.',
    '.oKoooKo.',
    '.oKoooKo.',
    'ooooooooo',
    '.ooooooo.',
    '.OOOOOOO.',
    '..o.o.o.o',
  ],
  mini_clawd_blink: [
    '.ooooooo.',
    '.ooooooo.',
    '.oKoooKo.',
    'ooooooooo',
    '.ooooooo.',
    '.OOOOOOO.',
    '.o.o.o.o.',
  ],
  mini_clawd_cheer: [
    'o.ooooo.o',
    'ooKoooKoo',
    '.oKoooKo.',
    '.ooooooo.',
    '.ooooooo.',
    '.OOOOOOO.',
    '.o.o.o.o.',
  ],
  mini_clawd_sleep: [
    '.........',
    '.........',
    '.ooooooo.',
    '.oKKoKKo.',
    'ooooooooo',
    '.OOOOOOO.',
    'OO.....OO',
  ],

  // ---- creeper (6x11) ----
  creeper: [
    'ghgggG',
    'KKgGKK',
    'KKghKK',
    'gGKKgg',
    'gKKKKg',
    'gKghKg',
    '.gGhg.',
    '.gggG.',
    '.Ghgg.',
    'gg..gG',
    'Gg..gg',
  ],

  // ---- wolf (10x7, facing right) ----
  wolf_walk0: [
    '......x.x.',
    '......wwww',
    'x.....wKwn',
    '.xwwwwwrww',
    '.wwwwwwr..',
    '.w.w..w.w.',
    '.w.w..w.w.',
  ],
  wolf_walk1: [
    '......x.x.',
    '......wwww',
    'x.....wKwn',
    '.xwwwwwrww',
    '.wwwwwwr..',
    '.w.w..w.w.',
    '..w.w..w.w',
  ],
  wolf_sit: [
    '......x.x.',
    '......wwww',
    '......wKwn',
    '....wwwrww',
    '..xwwwwr..',
    '.xwwwwww..',
    '..ww.w.w..',
  ],

  // ---- items ----
  diamond: [
    '..EEE..',
    '.EWEEE.',
    'EEEEEE6',
    '.EEEE6.',
    '..EE6..',
    '...6...',
  ],
  fish: [
    '..vvvv.v',
    '.vKvBvvv',
    '.vvvvvvv',
    '..vvvv.v',
  ],
  bone: [
    'W.....W',
    'WWWWWWW',
    'W.....W',
  ],
  arrow: [
    '8.......',
    '8kkkkkss',
    '8.......',
  ],
  pick_up: [
    '.sssss.',
    's..m..s',
    '...m...',
    '...m...',
    '...m...',
    '...m...',
    '...m...',
  ],
  pick_down: [
    '..sss..',
    '.....s.',
    '....m.s',
    '...m...',
    '..m....',
    '.m.....',
    'm......',
  ],
  rod: [
    '.......m',
    '......m.',
    '.....m..',
    '....m...',
    '...m....',
    '..m.....',
    '.m......',
    'm.......',
  ],
  bobber: [
    '33',
    'WW',
  ],
  bow: [
    '8m..',
    '8.m.',
    '8..m',
    '8..m',
    '8..m',
    '8..m',
    '8.m.',
    '8m..',
  ],
  rocket: [
    '.3.',
    '3W3',
    '333',
    '3W3',
    '333',
    '.m.',
    '.m.',
    '.m.',
  ],
  book: [
    '.WW.WW.',
    '3WWkWW3',
    '333k333',
  ],
  heart: [
    '33.33',
    '33333',
    '.333.',
    '..3..',
  ],

  // ---- props left in the world ----
  crafting: [
    '77kkkk77',
    'kmmmmmmk',
    '7Sk77kS7',
    '7Sk77kS7',
    '77k77k77',
    '7kkkkkk7',
    '7k7777k7',
    '7kkkkkk7',
  ],
  furnace: [
    'SsssssSs',
    'sSssSsss',
    's000000s',
    's0SSSS0s',
    's000000s',
    'sssSssss',
    'sSsssssS',
    'SsssSsss',
  ],
  furnace_lit0: [
    'SsssssSs',
    'sSssSsss',
    's000000s',
    's012210s',
    's022220s',
    'sssSssss',
    'sSsssssS',
    'SsssSsss',
  ],
  furnace_lit1: [
    'SsssssSs',
    'sSssSsss',
    's000000s',
    's021120s',
    's023320s',
    'sssSssss',
    'sSsssssS',
    'SsssSsss',
  ],
  chest: [
    'mmmmmmmm',
    'mkkkkkkm',
    'mkkkkkkm',
    'mmmsSmmm',
    'mkkSskkm',
    'mkkkkkkm',
    'mmmmmmmm',
  ],
  chest_open: [
    'mmmmmmm.',
    'mkkkkkm.',
    '.mmmmmmm',
    'm0E0010m',
    'mkkSskkm',
    'mkkkkkkm',
    'mmmmmmmm',
  ],
  target: [
    'WWWWWWWW',
    'W333333W',
    'W3WWWW3W',
    'W3W33W3W',
    'W3W33W3W',
    'W3WWWW3W',
    'W333333W',
    'WWWWWWWW',
  ],
  lectern0: [
    '...WWu..',
    '..7777k.',
    '.7777k..',
    '...7k...',
    '...7k...',
    '...7k...',
    '..777k..',
    '.777777k',
  ],
  lectern1: [
    '..uWW...',
    '..7777k.',
    '.7777k..',
    '...7k...',
    '...7k...',
    '...7k...',
    '..777k..',
    '.777777k',
  ],
  enchant: [
    'E333333E',
    '03000030',
    '00000000',
    '00400400',
    '00000000',
    '04000040',
  ],
  sign_q: [
    'mmmmmmmm',
    'mkkKKkkm',
    'mkkkkKkm',
    'mkkkKkkm',
    'mkkkkkkm',
    'mkkkKkkm',
    'mmmmmmmm',
    '...mm...',
    '...mm...',
    '...mm...',
  ],
  sign_lines: [
    'mmmmmmmm',
    'mKKkKKkm',
    'mkkkkkkm',
    'mKkKKKkm',
    'mkkkkkkm',
    'mKKKkKkm',
    'mmmmmmmm',
    '...mm...',
    '...mm...',
    '...mm...',
  ],
  composter: [
    'kmkmkmkm',
    'kddDdddk',
    'kdDdddDk',
    'kmkmkmkm',
    'k......k',
    'kmkmkmkm',
    'k......k',
    'kmkmkmkm',
  ],
  campfire0: [
    '...1....',
    '..11.1..',
    '..121...',
    '.12221..',
    '.23332..',
    '.L2332l.',
    'LLlllLLl',
    'lLLlLLlL',
  ],
  campfire1: [
    '....1...',
    '..1.11..',
    '...121..',
    '..12221.',
    '..23332.',
    '.L2332l.',
    'LLlllLLl',
    'lLLlLLlL',
  ],
  torch0: [
    '.1.',
    '121',
    '.m.',
    '.m.',
    '.m.',
    '.m.',
    '.m.',
  ],
  torch1: [
    '.2.',
    '1T1',
    '.m.',
    '.m.',
    '.m.',
    '.m.',
    '.m.',
  ],

  // ---- sky ----
  sun: [
    '11111111',
    '1zzzzzz1',
    '1zWWWWz1',
    '1zWWWWz1',
    '1zWWWWz1',
    '1zWWWWz1',
    '1zzzzzz1',
    '11111111',
  ],
  moon: [
    'QQQQQQQQ',
    'QqqqqQqQ',
    'QqQqqqqQ',
    'QqqqqqqQ',
    'QqqqQqqQ',
    'QQqqqqqQ',
    'QqqqqqQQ',
    'QQQQQQQQ',
  ],

  // ---- speech and particles ----
  bubble1: [
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WW9WWWWWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..WW......',
    '.W........',
  ],
  bubble2: [
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WW9WW9WWWW',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..WW......',
    '.W........',
  ],
  bubble3: [
    '.WWWWWWWW.',
    'WWWWWWWWWW',
    'WW9WW9WW9W',
    'WWWWWWWWWW',
    '.WWWWWWWW.',
    '..WW......',
    '.W........',
  ],
  zzz: [
    'WWWW',
    '..W.',
    '.W..',
    'WWWW',
  ],
  glyph0: ['5.5', '.5.', '5.5'],
  glyph1: ['55.', '5.5', '.55'],
  glyph2: ['5..', '555', '..5'],
  glyph3: ['.5.', '555', '.5.'],

  // ---- ground decorations ----
  flower_red: ['.3.', '313', '.3.', '.a.', '.a.'],
  flower_yellow: ['.1.', '121', '.1.', '.a.', '.a.'],
  tallgrass: ['..a..', 'a.a.b', '.aAa.', 'bAaAa', 'aAAAa'],
  deadbush: ['m...m', '.m.m.', '..m..', '.mm..', '..m..'],
  mushroom_small: ['333', '3W3', '.u.'],
  fungus: ['.HHH.', 'HH1HH', '..T..', '..T..'],
} as const satisfies Record<string, readonly string[]>

type Tinted = 'clawd_hurt' | 'mini_clawd_hurt' | 'creeper_flash'
/** A block's cracks as it is mined, stage 0 (a scratch) to 9 (about to break). */
export type CrackName = `crack${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
export type SpriteName = keyof typeof RAW | Tinted | CrackName
export type TextureName = Extract<SpriteName, `tex_${string}`>

/** Decoded pixels: `px[y * w + x]` is 0xRRGGBB, or -1 where transparent. */
export type Pixels = { w: number; h: number; px: Int32Array }

/** Sprites made from others by blending every pixel toward one color. */
const TINTED: Record<Tinted, [keyof typeof RAW, number, number]> = {
  clawd_hurt: ['clawd_idle', 0xff2a2a, 0.55],
  mini_clawd_hurt: ['mini_clawd_idle', 0xff2a2a, 0.55],
  creeper_flash: ['creeper', 0xffffff, 0.8],
}

/** The order cracks spread across an 8x8 block, from its middle outward. */
const CRACK_PATH: readonly [number, number][] = [
  [3, 3], [4, 4], [4, 3], [2, 2], [5, 5], [1, 2], [5, 2], [6, 1], [2, 5], [1, 6],
  [6, 6], [0, 1], [7, 0], [3, 5], [2, 6], [0, 7], [6, 4], [7, 4], [5, 6], [6, 7],
  [1, 3], [0, 4], [4, 1], [4, 0], [3, 6], [7, 6], [2, 0], [1, 0],
]

function crack(stage: number): Pixels {
  const px = new Int32Array(64).fill(-1)
  const shown = Math.round((CRACK_PATH.length * 0.7 * (stage + 1)) / 10)
  for (const [x, y] of CRACK_PATH.slice(0, shown)) {
    px[y * 8 + x] = 0x1a1618
  }

  return { w: 8, h: 8, px }
}

/** The mini sprite drawn for a full-size one on the terminal, if there is one. */
export function miniOf(name: SpriteName): SpriteName | undefined {
  const mini = `mini_${name}`

  return mini in RAW || mini === 'mini_clawd_hurt' ? (mini as SpriteName) : undefined
}

const decoded = new Map<SpriteName, Pixels>()

export function blend(a: number, b: number, k: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k)
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k)
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k)

  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl)
}

function decodeRaw(rows: readonly string[]): Pixels {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  const px = new Int32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? ''
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? '.'
      px[y * w + x] = ch === '.' ? -1 : (PALETTE[ch] ?? 0xff00ff)
    }
  }

  return { w, h, px }
}

export function sprite(name: SpriteName): Pixels {
  const hit = decoded.get(name)
  if (hit) {
    return hit
  }
  let out: Pixels
  if (name.startsWith('crack')) {
    out = crack(Number(name.slice(5)))
  } else if (name === 'clawd_hurt' || name === 'mini_clawd_hurt' || name === 'creeper_flash') {
    const [base, color, k] = TINTED[name]
    const src = sprite(base)
    const px = new Int32Array(src.px.length)
    for (let n = 0; n < px.length; n++) {
      const c = src.px[n] ?? -1
      px[n] = c < 0 ? -1 : blend(c, color, k)
    }
    out = { w: src.w, h: src.h, px }
  } else {
    out = decodeRaw(RAW[name as keyof typeof RAW])
  }
  decoded.set(name, out)

  return out
}

/** Every raw sprite's name, for tests and checks. */
export const RAW_NAMES = Object.keys(RAW) as (keyof typeof RAW)[]

export function rawRows(name: keyof typeof RAW): readonly string[] {
  return RAW[name]
}

export function hasColor(ch: string): boolean {
  return ch === '.' || ch in PALETTE
}

export function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}
