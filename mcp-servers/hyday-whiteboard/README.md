# hyday-whiteboard MCP Server

A stdio-based [MCP](https://modelcontextprotocol.io) server that exposes Hyday's whiteboard as a set of tools an AI agent can call directly.

This server reads and writes the whiteboard sidecar at:

```
<DATA_ROOT>/.hyday/whiteboards-v2.json
```

It does **not** require the Hyday desktop app to be running — it talks directly to the same JSON file Hyday uses.

## Source

This file is a copy of `mcp/whiteboard-server.cjs` from the [hyday-source](https://github.com/mukiwu/hyday-source) repository. Keep them in sync if you fork.

## Install

From this directory:

```sh
npm install
```

That installs `@modelcontextprotocol/sdk` and `zod`.

## Configure your agent

Add an entry to your agent's MCP config (e.g. `.mcp.json` at the root of your working directory):

```json
{
  "mcpServers": {
    "hyday-whiteboard": {
      "command": "node",
      "args": [
        "/absolute/path/to/hyday-skills/mcp-servers/hyday-whiteboard/whiteboard-server.cjs"
      ]
    }
  }
}
```

### Telling the server where your Hyday vault is

The server resolves `DATA_ROOT` in this order (first match wins):

1. CLI arg: `--data-root /absolute/path/to/vault`
2. Env var: `HYDAY_DATA_ROOT=/absolute/path/to/vault`
3. Auto-detect: reads `journalPath` from Hyday's `settings.json`
   - macOS: `~/Library/Application Support/Hyday/settings.json`
   - Linux: `~/.config/Hyday/settings.json`
4. Fallback: `~/.hyday-recovery` (if present)

If you have a single Hyday vault on the same machine, **auto-detect just works** — no extra config needed.

If you need to point at a different vault, add `--data-root`:

```json
{
  "mcpServers": {
    "hyday-whiteboard": {
      "command": "node",
      "args": [
        "/absolute/path/to/hyday-skills/mcp-servers/hyday-whiteboard/whiteboard-server.cjs",
        "--data-root",
        "/path/to/my/vault"
      ]
    }
  }
}
```

## What it exposes

12 tools — see the `hyday-whiteboard` SKILL.md for full agent-facing documentation. Quick list:

| Tool | Purpose |
|------|---------|
| `listWhiteboards` | List all boards. |
| `listWhiteboardItems` | List items on a board. |
| `createWhiteboard` | Create a new board. |
| `deleteWhiteboard` | Soft-delete a board. |
| `addNoteToWhiteboard` | Add an existing note as a card. |
| `addStickyNote` | Add a free-form sticky note. |
| `createWhiteboardGroup` | Add a group container. |
| `createWhiteboardConnection` | Connect two items with an arrow. |
| `updateWhiteboardItem` | Edit an item's text, color, or size. |
| `moveWhiteboardItems` | Reposition / resize items. |
| `removeWhiteboardItems` | Remove items (also drops their connections). |
| `buildWhiteboardLayout` | **Preferred** batch tool — creates groups, cards, and connections with auto-layout in a single call. |

## Debug log

The server writes a debug log to `~/.hyday-mcp-debug.log` (it can't log to stdout — stdout is the MCP transport).
