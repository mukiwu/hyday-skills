#!/usr/bin/env node
/**
 * Hyday Whiteboard MCP Server
 *
 * A standalone stdio-based MCP server that exposes whiteboard CRUD tools.
 * Reads/writes the sidecar JSON file directly (no Electron IPC needed).
 *
 * Usage:
 *   node mcp/whiteboard-server.cjs --data-root /path/to/data
 *
 * Or set HYDAY_DATA_ROOT env variable.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Debug log to file (MCP servers can't print to stdout) ──
const LOG_PATH = path.join(os.homedir(), '.hyday-mcp-debug.log');
function debugLog(...args) {
  const ts = new Date().toISOString();
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  fs.appendFileSync(LOG_PATH, `[${ts}] ${msg}\n`);
}
const crypto = require('crypto');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const z = require('zod');

// ── Resolve data root ──

function resolveDataRoot() {
  // CLI arg: --data-root /path
  const idx = process.argv.indexOf('--data-root');
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  // Env variable
  if (process.env.HYDAY_DATA_ROOT) {
    return process.env.HYDAY_DATA_ROOT;
  }
  // Try reading from Electron settings
  const settingsPath = path.join(
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support', 'Hyday')
      : path.join(os.homedir(), '.config', 'Hyday'),
    'settings.json',
  );
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    if (settings.journalPath) return settings.journalPath;
  } catch {
    // Try recovery hint
    try {
      const hint = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.hyday-recovery'), 'utf-8'));
      if (hint.journalPath) return hint.journalPath;
    } catch { /* ignore */ }
  }
  return null;
}

const DATA_ROOT = resolveDataRoot();
if (!DATA_ROOT) {
  process.stderr.write('Error: Could not determine data root. Use --data-root or set HYDAY_DATA_ROOT.\n');
  process.exit(1);
}

const SIDECAR_PATH = path.join(DATA_ROOT, '.hyday', 'whiteboards-v2.json');
const BACKUP_COUNT = 3;

// ── Sidecar I/O ──

function readState() {
  try {
    const raw = fs.readFileSync(SIDECAR_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 2) return parsed;
    return createDefaultState();
  } catch {
    return createDefaultState();
  }
}

function writeState(state) {
  const dir = path.dirname(SIDECAR_PATH);
  fs.mkdirSync(dir, { recursive: true });

  // Rotate backups
  if (fs.existsSync(SIDECAR_PATH)) {
    for (let i = BACKUP_COUNT; i >= 1; i--) {
      const src = i === 1 ? SIDECAR_PATH : `${SIDECAR_PATH}.backup.${i - 1}`;
      const dst = `${SIDECAR_PATH}.backup.${i}`;
      try {
        if (fs.existsSync(src)) fs.copyFileSync(src, dst);
      } catch { /* ignore */ }
    }
  }

  fs.writeFileSync(SIDECAR_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

function createDefaultState() {
  const now = new Date().toISOString();
  return {
    version: 2,
    boards: [{
      id: 'main',
      name: 'Main Board',
      defaultNewNoteTag: 'inbox',
      createdAt: now,
      lastModified: now,
    }],
    items: [],
    connections: [],
  };
}

function createId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function nextZIndex(items) {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.zIndex || 0)) + 1;
}

function ensureBoard(state, boardId) {
  const existing = state.boards.find((b) => b.id === boardId);
  if (existing) return existing;
  const now = nowIso();
  const board = { id: boardId, name: boardId, defaultNewNoteTag: 'inbox', createdAt: now, lastModified: now };
  state.boards.push(board);
  return board;
}

// ── Note reading helpers ──

function resolveNotePath(fileId) {
  // Notes live in {DATA_ROOT}/notes/{fileId}.md or {DATA_ROOT}/{fileId}.md
  const notesDir = path.join(DATA_ROOT, 'notes');
  const candidates = [
    path.join(notesDir, `${fileId}.md`),
    path.join(DATA_ROOT, `${fileId}.md`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]; // default
}

function readNoteContent(fileId) {
  try {
    return fs.readFileSync(resolveNotePath(fileId), 'utf-8');
  } catch {
    return '';
  }
}

function readNoteTitle(fileId) {
  try {
    const content = readNoteContent(fileId);
    // Extract title from frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/^title:\s*["']?(.+?)["']?\s*$/m);
      if (titleMatch) return titleMatch[1];
    }
    // Fallback: first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) return headingMatch[1];
    return fileId;
  } catch {
    return fileId;
  }
}

/**
 * Estimate card height based on note content length.
 * Card width default 200px. Rough heuristic: ~12 CJK chars per line at 200px, ~24px per line.
 */
function estimateCardHeight(fileId, cardWidth) {
  const content = readNoteContent(fileId);
  if (!content) return 300;
  // Strip frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim();
  const lines = body.split('\n');
  const charsPerLine = Math.max(8, Math.floor((cardWidth || 200) / 10)); // rough estimate
  let totalLines = 0;
  for (const line of lines) {
    if (!line.trim()) { totalLines += 0.5; continue; }
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine));
  }
  // title area ~50px + tags ~30px + padding ~40px + content lines
  const estimated = 120 + totalLines * 22;
  return Math.max(200, Math.min(800, Math.round(estimated)));
}

// ── Create MCP Server ──

const server = new McpServer({
  name: 'hyday-whiteboard',
  version: '1.0.0',
});

// -- Tool: listWhiteboards --
server.registerTool(
  'listWhiteboards',
  {
    description: 'List all whiteboard boards.',
    inputSchema: z.object({}),
  },
  async () => {
    const state = readState();
    const boards = state.boards.map((b) => ({
      id: b.id,
      name: b.name,
      itemCount: state.items.filter((i) => i.boardId === b.id).length,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }] };
  },
);

// -- Tool: listWhiteboardItems --
server.registerTool(
  'listWhiteboardItems',
  {
    description: 'List all items (cards, groups, sticky notes) on a whiteboard board.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
    }),
  },
  async ({ boardId }) => {
    const state = readState();
    const bid = boardId || 'main';
    const items = state.items
      .filter((i) => i.boardId === bid)
      .map((i) => ({
        id: i.id,
        noteId: i.noteId,
        itemKind: i.itemKind || 'note',
        title: i.noteId ? readNoteTitle(i.noteId) : (i.content || '').slice(0, 50),
        x: i.x,
        y: i.y,
        width: i.width,
        height: i.height,
      }));
    return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
  },
);

// -- Tool: createWhiteboard --
server.registerTool(
  'createWhiteboard',
  {
    description: 'Create a new whiteboard board.',
    inputSchema: z.object({
      name: z.string().describe('Name for the new board.'),
    }),
  },
  async ({ name }) => {
    const state = readState();
    const now = nowIso();
    const board = { id: createId(), name, defaultNewNoteTag: 'inbox', createdAt: now, lastModified: now };
    state.boards.push(board);
    writeState(state);
    return { content: [{ type: 'text', text: `Board created: id="${board.id}" name="${board.name}"` }] };
  },
);

// -- Tool: addNoteToWhiteboard --
server.registerTool(
  'addNoteToWhiteboard',
  {
    description: 'Add an existing note as a card on a whiteboard board. Height is auto-estimated from content — do NOT specify height. The response includes actual dimensions (e.g. "200×450") — use the returned height to calculate the next card\'s Y position. Cards must NOT overlap: next Y = previous Y + returned height + 40px gap. Use width=200 for standard cards.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      noteId: z.string().describe('The fileId of the note to add.'),
      x: z.number().describe('X position on the canvas.'),
      y: z.number().describe('Y position on the canvas.'),
      width: z.number().optional().describe('Card width in px. Default 200.'),
      height: z.number().optional().describe('Card height in px. Omit to auto-estimate from note content — recommended.'),
    }),
  },
  async ({ boardId, noteId, x, y, width, height }) => {
    debugLog('addNoteToWhiteboard', { boardId, noteId, x, y, width, height });
    const state = readState();
    const bid = boardId || 'main';
    ensureBoard(state, bid);
    const boardItems = state.items.filter((i) => i.boardId === bid);
    const cardWidth = Math.max(120, width || 200);
    const cardHeight = height ? Math.max(90, height) : estimateCardHeight(noteId, cardWidth);
    debugLog('  → estimated size', { cardWidth, cardHeight });
    const now = nowIso();
    const item = {
      id: createId(),
      boardId: bid,
      noteId,
      itemKind: 'note',
      x, y,
      width: cardWidth,
      height: cardHeight,
      zIndex: nextZIndex(boardItems),
      createdAt: now,
      lastModified: now,
    };
    state.items.push(item);
    writeState(state);
    return { content: [{ type: 'text', text: `Note "${noteId}" added to board "${bid}" as item "${item.id}" (${item.width}×${item.height}).` }] };
  },
);

// -- Tool: addStickyNote --
server.registerTool(
  'addStickyNote',
  {
    description: 'Add a sticky note with text content on a whiteboard board.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      content: z.string().describe('Text content for the sticky note.'),
      x: z.number().describe('X position on the canvas.'),
      y: z.number().describe('Y position on the canvas.'),
      color: z.string().optional().describe('Color name: yellow, blue, green, pink, purple, orange. Default: yellow.'),
    }),
  },
  async ({ boardId, content, x, y, color }) => {
    const state = readState();
    const bid = boardId || 'main';
    ensureBoard(state, bid);
    const boardItems = state.items.filter((i) => i.boardId === bid);
    const now = nowIso();
    const item = {
      id: createId(),
      boardId: bid,
      noteId: '',
      itemKind: 'sticky',
      type: 'stickyNote',
      content,
      color: color || 'yellow',
      x, y,
      width: 200,
      height: 150,
      zIndex: nextZIndex(boardItems),
      createdAt: now,
      lastModified: now,
    };
    state.items.push(item);
    writeState(state);
    return { content: [{ type: 'text', text: `Sticky note created: id="${item.id}" on board "${bid}".` }] };
  },
);

// -- Tool: createWhiteboardGroup --
server.registerTool(
  'createWhiteboardGroup',
  {
    description: 'Create a group container on a whiteboard board. IMPORTANT: (1) Create groups AFTER placing all cards so you know exact dimensions. (2) Title must be a meaningful theme name (e.g. "系統思考基礎"), NEVER use generic names like "Group Name". (3) Position the group to wrap around its cards: x = leftmost card X - 30, y = topmost card Y - 60 (title space). (4) Size: width = card area width + 60, height = card area height + 90.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      title: z.string().describe('A meaningful, descriptive theme name for this group. E.g., "核心概念", "應用案例", "行動建議". NEVER use "Group Name" or generic labels.'),
      x: z.number().describe('X position — should be leftmost card X minus 30px padding.'),
      y: z.number().describe('Y position — should be topmost card Y minus 60px (space for title).'),
      width: z.number().optional().describe('Width — should cover all cards horizontally plus 60px padding.'),
      height: z.number().optional().describe('Height — should cover all cards vertically plus 90px padding (60 top + 30 bottom).'),
    }),
  },
  async ({ boardId, title, x, y, width, height }) => {
    const state = readState();
    const bid = boardId || 'main';
    ensureBoard(state, bid);
    const boardItems = state.items.filter((i) => i.boardId === bid);
    const now = nowIso();
    const item = {
      id: createId(),
      boardId: bid,
      noteId: '',
      itemKind: 'group',
      type: 'group',
      content: title,
      x, y,
      width: Math.max(120, width || 400),
      height: Math.max(90, height || 300),
      zIndex: 0, // Groups go behind cards
      createdAt: now,
      lastModified: now,
    };
    state.items.push(item);
    writeState(state);
    return { content: [{ type: 'text', text: `Group "${title}" created: id="${item.id}" on board "${bid}".` }] };
  },
);

// -- Helper: find best handles for shortest connection between two items --
function bestHandles(fromItem, toItem) {
  const sides = ['top', 'bottom', 'left', 'right'];
  function anchorPoint(item, side) {
    const cx = item.x + (item.width || 170) / 2;
    const cy = item.y + (item.height || 300) / 2;
    const hw = (item.width || 170) / 2;
    const hh = (item.height || 300) / 2;
    switch (side) {
      case 'top':    return { x: cx, y: item.y };
      case 'bottom': return { x: cx, y: item.y + (item.height || 300) };
      case 'left':   return { x: item.x, y: cy };
      case 'right':  return { x: item.x + (item.width || 170), y: cy };
    }
  }
  let best = null;
  let bestDist = Infinity;
  for (const s of sides) {
    for (const t of sides) {
      const a = anchorPoint(fromItem, s);
      const b = anchorPoint(toItem, t);
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < bestDist) { bestDist = d; best = { sourceHandle: s, targetHandle: t }; }
    }
  }
  return best || { sourceHandle: 'bottom', targetHandle: 'top' };
}

// -- Tool: createWhiteboardConnection --
server.registerTool(
  'createWhiteboardConnection',
  {
    description: 'Create a connection (arrow) between two items on a whiteboard board. Automatically picks the best handle positions (top/bottom/left/right) for the shortest path.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      fromItemId: z.string().describe('The item ID to connect from.'),
      toItemId: z.string().describe('The item ID to connect to.'),
      label: z.string().optional().describe('Optional label for the connection.'),
    }),
  },
  async ({ boardId, fromItemId, toItemId, label }) => {
    const state = readState();
    const bid = boardId || 'main';
    const fromItem = state.items.find((i) => i.boardId === bid && i.id === fromItemId);
    const toItem = state.items.find((i) => i.boardId === bid && i.id === toItemId);
    if (!fromItem || !toItem) {
      return { content: [{ type: 'text', text: 'Error: One or both items do not exist on this board.' }], isError: true };
    }
    const handles = bestHandles(fromItem, toItem);
    const now = nowIso();
    const conn = {
      id: createId(),
      boardId: bid,
      fromItemId,
      toItemId,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      type: 'default',
      color: '',
      label: label || '',
      createdAt: now,
      lastModified: now,
    };
    state.connections.push(conn);
    writeState(state);
    return { content: [{ type: 'text', text: `Connection created: id="${conn.id}" from "${fromItemId}" (${handles.sourceHandle}) to "${toItemId}" (${handles.targetHandle}).` }] };
  },
);

// -- Tool: updateWhiteboardItem --
server.registerTool(
  'updateWhiteboardItem',
  {
    description: 'Update properties of an existing whiteboard item (e.g. rename a group title, edit sticky note text, change color).',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      itemId: z.string().describe('The item ID to update.'),
      content: z.string().optional().describe('New text content (group title or sticky note text).'),
      color: z.string().optional().describe('New color value.'),
      width: z.number().optional().describe('New width in pixels.'),
      height: z.number().optional().describe('New height in pixels.'),
    }),
  },
  async ({ boardId, itemId, content, color, width, height }) => {
    const state = readState();
    const bid = boardId || 'main';
    const idx = state.items.findIndex((i) => i.boardId === bid && i.id === itemId);
    if (idx < 0) {
      return { content: [{ type: 'text', text: `Error: Item "${itemId}" not found on board "${bid}".` }], isError: true };
    }
    const item = state.items[idx];
    const changes = [];
    if (content != null) { item.content = content; changes.push('content'); }
    if (color != null) { item.color = color; changes.push('color'); }
    if (width != null) { item.width = Math.max(120, width); changes.push('width'); }
    if (height != null) { item.height = Math.max(90, height); changes.push('height'); }
    if (changes.length === 0) {
      return { content: [{ type: 'text', text: 'No changes specified.' }], isError: true };
    }
    item.lastModified = nowIso();
    writeState(state);
    return { content: [{ type: 'text', text: `Updated item "${itemId}" on board "${bid}": ${changes.join(', ')}.` }] };
  },
);

// -- Tool: moveWhiteboardItems --
server.registerTool(
  'moveWhiteboardItems',
  {
    description: 'Move one or more items to new positions on a whiteboard board. Also supports resizing.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      moves: z.array(z.object({
        itemId: z.string().describe('The item ID to move.'),
        x: z.number().describe('New X position.'),
        y: z.number().describe('New Y position.'),
        width: z.number().optional().describe('New width (optional).'),
        height: z.number().optional().describe('New height (optional).'),
      })).describe('Array of moves.'),
    }),
  },
  async ({ boardId, moves }) => {
    const state = readState();
    const bid = boardId || 'main';
    let moved = 0;
    for (const m of moves) {
      const idx = state.items.findIndex((i) => i.boardId === bid && i.id === m.itemId);
      if (idx < 0) continue;
      state.items[idx].x = m.x;
      state.items[idx].y = m.y;
      if (m.width != null) state.items[idx].width = Math.max(120, m.width);
      if (m.height != null) state.items[idx].height = Math.max(90, m.height);
      state.items[idx].lastModified = nowIso();
      moved++;
    }
    writeState(state);
    return { content: [{ type: 'text', text: `Moved ${moved}/${moves.length} items on board "${bid}".` }] };
  },
);

// -- Tool: removeWhiteboardItems --
server.registerTool(
  'removeWhiteboardItems',
  {
    description: 'Remove one or more items from a whiteboard board. DESTRUCTIVE.',
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      itemIds: z.array(z.string()).describe('Array of item IDs to remove.'),
    }),
  },
  async ({ boardId, itemIds }) => {
    const state = readState();
    const bid = boardId || 'main';
    const target = new Set(itemIds);
    const before = state.items.length;
    state.items = state.items.filter((i) => !(i.boardId === bid && target.has(i.id)));
    const removed = before - state.items.length;
    // Also remove connections referencing removed items
    state.connections = state.connections.filter(
      (c) => c.boardId !== bid || (!target.has(c.fromItemId) && !target.has(c.toItemId)),
    );
    writeState(state);
    return { content: [{ type: 'text', text: `Removed ${removed}/${itemIds.length} items from board "${bid}".` }] };
  },
);

// -- Tool: deleteWhiteboard --
server.registerTool(
  'deleteWhiteboard',
  {
    description: 'Delete an entire whiteboard board and all its contents. DESTRUCTIVE. Cannot delete the default board.',
    inputSchema: z.object({
      boardId: z.string().describe('The board ID to delete.'),
    }),
  },
  async ({ boardId }) => {
    if (boardId === 'main') {
      return { content: [{ type: 'text', text: 'Error: Cannot delete the default board.' }], isError: true };
    }
    const state = readState();
    const boardIdx = state.boards.findIndex((b) => b.id === boardId);
    if (boardIdx < 0) {
      return { content: [{ type: 'text', text: `Error: Board "${boardId}" not found.` }], isError: true };
    }
    // Soft-delete to trashedBoards
    const board = state.boards[boardIdx];
    const boardItems = state.items.filter((i) => i.boardId === boardId);
    const boardConns = state.connections.filter((c) => c.boardId === boardId);
    if (!state.trashedBoards) state.trashedBoards = [];
    state.trashedBoards.push({ board, items: boardItems, connections: boardConns, trashedAt: nowIso() });
    state.boards.splice(boardIdx, 1);
    state.items = state.items.filter((i) => i.boardId !== boardId);
    state.connections = state.connections.filter((c) => c.boardId !== boardId);
    writeState(state);
    return { content: [{ type: 'text', text: `Board "${boardId}" deleted (soft-delete, can be restored).` }] };
  },
);

// -- Tool: buildWhiteboardLayout --
// Batch tool: AI provides groups with noteIds, server auto-calculates all positions.
server.registerTool(
  'buildWhiteboardLayout',
  {
    description: [
      'Build an entire whiteboard layout in one call. Provide groups of notes and the server handles all positioning automatically.',
      'This is the PREFERRED way to create whiteboard layouts — avoids overlapping cards and bad positioning.',
      'The server will: create all cards with auto-estimated heights, arrange them in a clean grid within each group,',
      'create labeled group containers, and create connections between cards.',
      'Returns a summary of everything created.',
    ].join(' '),
    inputSchema: z.object({
      boardId: z.string().optional().describe('The board ID. Omit to use the default board.'),
      groups: z.array(z.object({
        title: z.string().describe('Descriptive group title (e.g. "系統思考基礎"). NEVER use "Group Name".'),
        noteIds: z.array(z.string()).describe('Array of note fileIds to place in this group.'),
        color: z.string().optional().describe('Group color.'),
      })).describe('Array of groups, each with a title and list of note IDs. Groups are arranged left-to-right.'),
      connections: z.array(z.object({
        fromNoteId: z.string().describe('Source note fileId.'),
        toNoteId: z.string().describe('Target note fileId.'),
        label: z.string().optional().describe('Edge label (e.g. "延伸閱讀", "基礎概念").'),
      })).optional().describe('Connections between notes (by noteId). Handle positions are auto-calculated.'),
      cardWidth: z.number().optional().describe('Card width in px. Default 220.'),
      columns: z.number().optional().describe('Max columns per group. Default 1 for ≤3 cards, 2 for 4+ cards.'),
    }),
  },
  async ({ boardId, groups, connections, cardWidth: inputCardWidth, columns: inputColumns }) => {
    debugLog('buildWhiteboardLayout', { boardId, groupCount: groups.length, connectionCount: connections?.length });
    const state = readState();
    const bid = boardId || 'main';
    ensureBoard(state, bid);

    const CARD_W = Math.max(120, inputCardWidth || 220);
    const GAP_X = 40;       // horizontal gap between cards
    const GAP_Y = 40;       // vertical gap between cards
    const GROUP_PAD_X = 30;  // left/right padding inside group
    const GROUP_PAD_TOP = 60; // top padding (title space)
    const GROUP_PAD_BOTTOM = 30;
    const GROUP_GAP = 80;    // gap between groups
    const now = nowIso();

    // noteId → item (for connections later)
    const noteIdToItem = new Map();
    const createdItems = [];
    const createdGroups = [];
    let groupX = 0;

    for (const group of groups) {
      const noteIds = group.noteIds || [];
      if (noteIds.length === 0) continue;

      const cols = inputColumns || (noteIds.length >= 4 ? 2 : 1);

      // Estimate heights for all cards in this group
      const cardInfos = noteIds.map((noteId) => ({
        noteId,
        width: CARD_W,
        height: estimateCardHeight(noteId, CARD_W),
      }));

      // Arrange cards in columns
      // Distribute cards across columns (fill column by column)
      const columnCards = Array.from({ length: cols }, () => []);
      for (let i = 0; i < cardInfos.length; i++) {
        columnCards[i % cols].push(cardInfos[i]);
      }

      // Calculate positions for each card
      const cardPositions = []; // { noteId, x, y, width, height }
      let maxColumnBottom = 0;

      for (let col = 0; col < cols; col++) {
        const colX = groupX + GROUP_PAD_X + col * (CARD_W + GAP_X);
        let curY = GROUP_PAD_TOP;

        for (const card of columnCards[col]) {
          cardPositions.push({
            noteId: card.noteId,
            x: colX,
            y: curY,
            width: card.width,
            height: card.height,
          });
          curY += card.height + GAP_Y;
        }
        if (curY - GAP_Y > maxColumnBottom) {
          maxColumnBottom = curY - GAP_Y;
        }
      }

      // Create group
      const groupW = GROUP_PAD_X * 2 + cols * CARD_W + (cols - 1) * GAP_X;
      const groupH = maxColumnBottom + GROUP_PAD_BOTTOM;
      const boardItems = state.items.filter((i) => i.boardId === bid);
      const groupItem = {
        id: createId(),
        boardId: bid,
        noteId: '',
        itemKind: 'group',
        type: 'group',
        content: group.title,
        color: group.color || '',
        x: groupX,
        y: 0,
        width: groupW,
        height: groupH,
        zIndex: 0,
        createdAt: now,
        lastModified: now,
      };
      state.items.push(groupItem);
      createdGroups.push(groupItem);

      // Create cards (with absolute positions: groupX + offset)
      for (const pos of cardPositions) {
        const item = {
          id: createId(),
          boardId: bid,
          noteId: pos.noteId,
          itemKind: 'note',
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          zIndex: nextZIndex(state.items.filter((i) => i.boardId === bid)),
          createdAt: now,
          lastModified: now,
        };
        state.items.push(item);
        createdItems.push(item);
        noteIdToItem.set(pos.noteId, item);
      }

      groupX += groupW + GROUP_GAP;
    }

    // Create connections
    const createdConns = [];
    if (connections) {
      for (const conn of connections) {
        const fromItem = noteIdToItem.get(conn.fromNoteId);
        const toItem = noteIdToItem.get(conn.toNoteId);
        if (!fromItem || !toItem) continue;
        const handles = bestHandles(fromItem, toItem);
        const edge = {
          id: createId(),
          boardId: bid,
          fromItemId: fromItem.id,
          toItemId: toItem.id,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'default',
          color: '',
          label: conn.label || '',
          createdAt: now,
          lastModified: now,
        };
        state.connections.push(edge);
        createdConns.push(edge);
      }
    }

    writeState(state);

    const summary = [
      `Layout built on board "${bid}":`,
      `  ${createdGroups.length} groups: ${createdGroups.map(g => `"${g.content}" (${g.width}×${g.height})`).join(', ')}`,
      `  ${createdItems.length} cards placed`,
      `  ${createdConns.length} connections created`,
    ].join('\n');
    debugLog('buildWhiteboardLayout done:', summary);
    return { content: [{ type: 'text', text: summary }] };
  },
);

// ── Start server ──

async function main() {
  debugLog('Server starting. Data root:', DATA_ROOT);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  debugLog('Server connected via stdio.');
  process.stderr.write(`[hyday-whiteboard-mcp] Server started. Data root: ${DATA_ROOT}\n`);
}

main().catch((err) => {
  process.stderr.write(`[hyday-whiteboard-mcp] Fatal error: ${err.message}\n`);
  process.exit(1);
});
