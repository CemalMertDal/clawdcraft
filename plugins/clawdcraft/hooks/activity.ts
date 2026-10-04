import type { ActivityKind, EffectKind } from '../types'

/** What a tool call looks like in the world, and what its success shows. */
export type Classified = {
  kind: ActivityKind
  success?: EffectKind
  /** Which achievement-worthy thing this is, beyond its kind. */
  tag?: 'fetch' | 'push' | 'commit' | 'test' | 'skill' | 'agent'
}

const FETCH_RE = /(^|[\s;&|(])(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|http|https|xh)\b|\bgh\s+api\b/i
const PUSH_RE = /\bgit\s+push\b/i
const COMMIT_RE = /\bgit\s+commit\b/i
const TEST_RE =
  /\b(jest|vitest|pytest|mocha|rspec|phpunit|ctest)\b|\b(cargo|go|dotnet|deno|bun|swift|mvn|gradle)\s+test\b|\b(npm|pnpm|yarn)\s+(run\s+)?test\b|\bclaude\s+plugin\s+test\b/i
const SEARCH_RE = /^\s*(grep|rg|ag|find|fd|ls|dir|tree|where|which|select-string|get-childitem|gci)\b/i
const READ_RE = /^\s*(cat|head|tail|less|more|type|bat|get-content|gc)\b/i

/** Maps a shell command to an activity. */
export function classifyCommand(command: string): Classified {
  if (PUSH_RE.test(command)) {
    return { kind: 'rocket', success: 'firework', tag: 'push' }
  }
  if (COMMIT_RE.test(command)) {
    return { kind: 'chest', success: 'item', tag: 'commit' }
  }
  if (TEST_RE.test(command)) {
    return { kind: 'test', success: 'bullseye', tag: 'test' }
  }
  if (FETCH_RE.test(command)) {
    return { kind: 'fish', success: 'catch', tag: 'fetch' }
  }
  if (SEARCH_RE.test(command)) {
    return { kind: 'mine', success: 'diamond' }
  }
  if (READ_RE.test(command)) {
    return { kind: 'read' }
  }

  return { kind: 'smelt' }
}

/** Maps a tool call (`tool` and its arguments) to an activity. */
export function classify(tool: string, input: Record<string, unknown>): Classified {
  switch (tool) {
    case 'WebFetch':
    case 'WebSearch':
    case 'ReadMcpResource':
    case 'ListMcpResources':
      return { kind: 'fish', success: 'catch', tag: 'fetch' }
    case 'Grep':
    case 'Glob':
    case 'LS':
    case 'ToolSearch':
      return { kind: 'mine', success: 'diamond' }
    case 'Read':
    case 'NotebookRead':
      return { kind: 'read' }
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { kind: 'craft', success: 'item' }
    case 'Write':
      return { kind: 'build', success: 'block' }
    case 'Bash':
    case 'PowerShell':
      return classifyCommand(typeof input.command === 'string' ? input.command : '')
    case 'Skill':
      return { kind: 'magic', success: 'sparkle', tag: 'skill' }
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet':
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return { kind: 'plan' }
    case 'Agent':
    case 'Task':
      return { kind: 'walk', tag: 'agent' }
    case 'AskUserQuestion':
      return { kind: 'wait' }
  }
  if (tool.startsWith('mcp__')) {
    return { kind: 'fish', success: 'catch', tag: 'fetch' }
  }

  return { kind: 'craft', success: 'item' }
}

/** The tag over Clawd's head: what Claude is doing, in a word; none while resting. */
export const TAG: Record<ActivityKind, string | null> = {
  idle: null,
  walk: 'working…',
  think: 'thinking…',
  fish: 'fetching…',
  mine: 'searching…',
  read: 'reading…',
  craft: 'editing…',
  build: 'writing…',
  smelt: 'running…',
  test: 'testing…',
  chest: 'committing…',
  rocket: 'pushing…',
  magic: 'casting…',
  plan: 'planning…',
  wait: 'waiting for you…',
  compost: 'compacting…',
  hurt: 'ouch!',
  sleep: 'zzz',
}

/** What each activity is called in `/mc stats` and the drawing's alt text. */
export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  idle: 'resting',
  walk: 'walking',
  think: 'thinking',
  fish: 'fishing',
  mine: 'mining',
  read: 'reading a book',
  craft: 'crafting',
  build: 'building',
  smelt: 'firing up the furnace',
  test: 'shooting at a target',
  chest: 'stashing loot in a chest',
  rocket: 'preparing a firework',
  magic: 'casting a spell',
  plan: 'writing on a sign',
  wait: 'waiting for permission',
  compost: 'composting',
  hurt: 'recovering from a creeper',
  sleep: 'sleeping',
}
