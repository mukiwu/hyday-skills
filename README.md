# Hyday Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mukiwu/hyday-skills?style=social)](https://github.com/mukiwu/hyday-skills/stargazers)

> 中文版本：[README.zh-TW.md](README.zh-TW.md)

Agent skills for [Hyday](https://hyday.tw) — a desktop notes & journal app.

These skills follow the [Agent Skills specification](https://agentskills.io/specification) so they can be used by any skills-compatible agent, including Claude Code, Codex CLI, and OpenCode.

Once installed, your AI agent will know how to read and write notes inside your Hyday vault correctly — frontmatter shape, journal filename conventions, the five Life Log marks, where files go, and what the whiteboard can and cannot do.

## If you only do one thing

**Install `hyday-markdown` first.** Every other skill builds on its conventions (frontmatter shape, `#tag` / `@(entity)` / `[[backlink]]` syntax), and 80% of an agent's value in Hyday is "write me a note that won't break Hyday's parser." `hyday-lifelog`, `hyday-vault-layout`, and `hyday-whiteboard` are worth adding once that one is in place — but a single `hyday-markdown` already gets the agent past the most common failure mode (writing files Hyday can't read back cleanly).

## Quick start for agents

**The first thing any Hyday skill does is locate the vault root**: the folder on disk where the user's notes live. Read it from Hyday's config file before doing anything else:

- macOS: `~/Library/Application Support/Hyday/settings.json` → `journalPath` field
- Windows: `%APPDATA%\Hyday\settings.json` → `journalPath` field
- Fallback: `~/.hyday-recovery` (same JSON shape)
- Last resort: ask the user

See `skills/hyday-vault-layout/SKILL.md` Step 0 for the full resolution chain and sanity checks. Every other skill assumes you've already done this — skipping it means writing to the wrong directory or failing silently.

## Installation

### npx skills

```sh
npx skills add https://github.com/mukiwu/hyday-skills
```

Or with SSH:

```sh
npx skills add git@github.com:mukiwu/hyday-skills.git
```

### Manually

#### Claude Code

Clone this repo somewhere and copy the `skills/` directory into your project's `.claude/skills/`. Claude Code auto-loads every `SKILL.md` inside `.claude/skills/`.

From your Hyday vault folder (or wherever you launch Claude Code from):

```sh
# clone once
git clone https://github.com/mukiwu/hyday-skills.git ~/hyday-skills

# install into a Claude Code workspace
mkdir -p .claude/skills
cp -R ~/hyday-skills/skills/* .claude/skills/

# (optional) install the whiteboard MCP server too
cp -R ~/hyday-skills/mcp-servers .claude/
cd .claude/mcp-servers/hyday-whiteboard && npm install && cd -
```

Then add the MCP server entry to your `.mcp.json` (see [`mcp-servers/hyday-whiteboard/README.md`](mcp-servers/hyday-whiteboard/README.md)). See the [Claude Skills documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for the full reference.

#### Codex CLI

Copy the `skills/` directory into your Codex skills path (typically `~/.codex/skills/`):

```sh
git clone https://github.com/mukiwu/hyday-skills.git /tmp/hyday-skills
mkdir -p ~/.codex/skills
cp -R /tmp/hyday-skills/skills/* ~/.codex/skills/
```

See the [Agent Skills spec](https://agentskills.io/specification) for the standard skill format.

#### OpenCode

Clone the full repo into `~/.opencode/skills/`:

```sh
git clone https://github.com/mukiwu/hyday-skills.git ~/.opencode/skills/hyday-skills
```

OpenCode auto-discovers `SKILL.md` files. Restart OpenCode after cloning.

## Skills

| Skill | Description |
|-------|-------------|
| [hyday-markdown](skills/hyday-markdown) | Write Hyday-flavored Markdown — frontmatter, note types, inline `#tag` / `@(entity)` / `[[backlink]]` syntax, callouts, math, and Mermaid diagrams. |
| [hyday-lifelog](skills/hyday-lifelog) | Write journal entries with the five Life Log marks: `>()` task start, `<()` task end, `-()` current, `%()` thought, `!()` important. |
| [hyday-vault-layout](skills/hyday-vault-layout) | Understand the folder convention — where journal entries, regular notes, templates, and assets live, plus what files an agent should leave alone. |
| [hyday-whiteboard](skills/hyday-whiteboard) | Create, edit, and lay out boards through the bundled `hyday-whiteboard` MCP server — add cards, sticky notes, groups, and connections programmatically. |

## Bundled MCP server

The `hyday-whiteboard` skill depends on the **`hyday-whiteboard` MCP server**, which is shipped in this repo at [`mcp-servers/hyday-whiteboard/`](mcp-servers/hyday-whiteboard). Set it up once:

1. `cd mcp-servers/hyday-whiteboard && npm install`
2. Add an entry to your agent's `.mcp.json` pointing `node` at `mcp-servers/hyday-whiteboard/whiteboard-server.cjs` (full example in [`mcp-servers/hyday-whiteboard/README.md`](mcp-servers/hyday-whiteboard/README.md)).
3. The server auto-detects your Hyday vault from `settings.json`; override with `--data-root` if you have multiple vaults.

The other three skills (`hyday-markdown`, `hyday-lifelog`, `hyday-vault-layout`) operate on plain `.md` files and don't need an MCP server — they work with the agent's built-in file tools.

## What this is for

These skills are for **end users of Hyday** who want to use an AI coding agent (Claude Code / Codex / OpenCode) to read, write, and organize notes in their vault. After installing:

- "幫我把今天的會議筆記寫成一個 Hyday 筆記" → agent produces a `.md` file with correct frontmatter.
- "把這篇文章存成 link note，加上 #reading 標籤" → agent creates a `link`-type note with the right `sourceUrl`, `sourceTitle`, etc.
- "幫我把今天的日誌寫起來，我上午處理 inbox、下午做了 migration" → agent writes `journal/2026/2026-05-17.md` with appropriate Life Log marks.
- "幫我做一張白板來回顧 Q3 讀的書" → agent uses the MCP server to create the notes, place them as cards, group them, and draw connections — all in your whiteboard, no manual placement needed.

These skills do **not** cover Hyday plugin/theme development or internal architecture. They're focused on the end-user workflow of capturing and organizing notes.

## Contributing

Bug reports, skill clarifications, new skills, translations, and MCP server fixes all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for what helps and how to keep skills aligned with real Hyday behavior.

## License

MIT
