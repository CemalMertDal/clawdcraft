# ClawdCraft

A Claude Code mod that shows what Claude is doing as a little 2D Minecraft world. Clawd, the Claude mascot, lives in a band above the prompt with a tag over his head saying what he is up to. Every time Claude thinks, he mines the block in front of him, and the block breaks when the thought ends. While Claude writes, he walks on. He stops only to do a job: fishing while Claude fetches data, reading at a lectern, firing up a furnace for a command. When something fails, a creeper walks up and blows up.

## Install

In Claude Code (the terminal, or the Code tab of the desktop app):

```
/plugin marketplace add CemalMertDal/clawdcraft
/plugin install clawdcraft@clawdcraft
```

Or from a shell:

```bash
claude plugin marketplace add CemalMertDal/clawdcraft
claude plugin install clawdcraft@clawdcraft
```

Then start a new session and type `/mc demo`. Every animation plays in turn, which takes about 50 seconds.

To update, run `claude plugin marketplace update clawdcraft`, then `claude plugin update clawdcraft@clawdcraft`.

## What Clawd does

| When Claude is… | Clawd… |
|---|---|
| Thinking | mines the block ahead: one thought, one block, cracking for as long as the thought lasts |
| Writing | walks on |
| Fetching data (WebFetch, WebSearch, MCP tools, `curl`) | goes fishing at a pond |
| Searching (Grep, Glob) | mines with a pickaxe and finds a diamond |
| Reading a file | reads a book on a lectern |
| Editing a file | works at a crafting table |
| Writing a new file | places a block |
| Running a command | fires up a furnace |
| Running tests | shoots arrows at a target |
| Running `git commit` / `git push` | stashes loot in a chest / launches a firework |
| Using a Skill | casts a spell at an enchanting table |
| Starting a subagent | gets a wolf companion |
| Waiting for permission | holds up a "?" sign |
| Hitting an error | **gets visited by a creeper that blows up** |
| Finishing a turn | puts up a torch |
| Sitting idle for a minute | sleeps by a campfire as night falls |

Under the grass and dirt lies stone with coal, iron, gold and diamond in it. As Clawd goes, the biome changes every 64 blocks: plains, forest, desert, snowy taiga, mushroom fields, and the Nether on long journeys. The journey and 14 advancements carry over between sessions.

## Commands

| Command | What it does |
|---|---|
| `/mc` | Switch between the band and a side pane |
| `/mc band` / `/mc pane` / `/mc hide` | Show as a band / show in a pane / hide |
| `/mc stats` | The journey so far and advancements |
| `/mc demo` | Play every animation in turn |
| `/mc new` | Start a new world from a new seed |

## Notes

- **No model tokens.** The mod never calls the model and adds nothing to the system prompt or the conversation. The one exception is the output of the `/mc` commands you run, which the model reads on the next turn. `/mc stats` is about 300–400 tokens.
- **Offline.** Everything is drawn on your machine and no network requests are made. The journey and advancements are kept in Claude Code's plugin store.
- **Desktop and terminal.** The desktop app gets animated SVG. The terminal gets pixel art made of half-block (`▀`) characters in an 11-row band: the world at half size with a dimmed ground so it sits quietly on a dark background, and Clawd drawn with his own small sprite so his face stays clear.
- **Early-access API.** The mod is built on Claude Code's function-hooks (mods) API, which may change between releases. Tested with Claude Code 2.1.286.

## Development

```bash
claude plugin validate plugins/clawdcraft
claude plugin test plugins/clawdcraft
claude --plugin-dir plugins/clawdcraft
```

The code lives in `plugins/clawdcraft/hooks/`:

| File | What's in it |
|---|---|
| `register.tsx` | The hooks and the `/mc` command |
| `world.ts` | The world and its state transitions |
| `scene.ts` | What to draw at a given moment |
| `render-svg.ts` | The desktop renderer |
| `render-raster.ts` | The terminal renderer |
| `sprites.ts` | The pixel art |

## License

MIT
