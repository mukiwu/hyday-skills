# Hyday Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mukiwu/hyday-skills?style=social)](https://github.com/mukiwu/hyday-skills/stargazers)

> English: [README.md](README.md)

[Hyday](https://hyday.tw) 的 Agent Skills——一份給桌面筆記與日誌 app 用的 skill 集合。

這些 skill 遵循 [Agent Skills 規範](https://agentskills.io/specification)，可以被任何支援 skill 的 agent 使用，包含 Claude Code、Codex CLI、OpenCode。

安裝後，你的 AI agent 會知道怎麼正確讀寫 Hyday vault 內的筆記——frontmatter 寫法、日誌檔名規則、五個 Life Log 標記、檔案要放哪、白板能跟不能做什麼。

## 只裝一個的話

**先裝 `hyday-markdown`**。其他 skill 都建立在它的規範之上（frontmatter、`#tag` / `@(entity)` / `[[backlink]]` 語法），而 80% 的 agent 在 Hyday 內的工作就是「幫我寫一則 Hyday 認得的筆記」。`hyday-lifelog`、`hyday-vault-layout`、`hyday-whiteboard` 之後再補進來都還來得及——但光是 `hyday-markdown` 就已經能讓 agent 避開最常見的問題（寫出 Hyday 解析不回來的檔案）。

## 給 Agent 的快速上手

**任何 Hyday skill 的第一件事都是定位 vault 根目錄**——使用者的筆記實際放在電腦的哪個資料夾。動任何讀寫之前先從 Hyday 的設定檔讀這個路徑：

- macOS：`~/Library/Application Support/Hyday/settings.json` → `journalPath` 欄位
- Windows：`%APPDATA%\Hyday\settings.json` → `journalPath` 欄位
- Fallback：`~/.hyday-recovery`（同樣的 JSON 結構）
- 最後手段：問使用者

完整的 resolution chain 跟 sanity check 寫在 `skills/hyday-vault-layout/SKILL.md` 的 Step 0。其他每個 skill 都假設你已經做過這步——跳過會寫到錯的資料夾或無聲無息地失敗。

## 安裝

> 下面方式**選一種就好**。同時用兩種（譬如 plugin marketplace + npx skills）會讓 Claude Code 載到重複的 SKILL.md，行為會混亂——挑一個適合你 agent 的並 stick with it。

### Claude Code plugin marketplace（如果只用 Claude Code，推薦這個）

```sh
/plugin marketplace add mukiwu/hyday-skills
/plugin install hyday@hyday-skills
```

之後透過 `/plugin` 指令更新或移除。如果 Claude Code 是你唯一的 agent，這條路最乾淨。

### npx skills（跨 agent：Claude Code / Codex CLI / OpenCode 都能用）

```sh
# 安裝
npx skills add https://github.com/mukiwu/hyday-skills
# （或用 SSH）
npx skills add git@github.com:mukiwu/hyday-skills.git

# 列出已安裝
npx skills list

# 更新（全部 / 或指定一個）
npx skills update
npx skills update hyday-skills

# 移除
npx skills remove hyday-skills
```

> `update` 之後記得重啟 agent（Cmd+Q Claude Code 再開），SKILL.md 才會 reload。

### 手動安裝

#### Claude Code

把這份 repo clone 下來，再把 `skills/` 目錄複製到你的專案的 `.claude/skills/`。Claude Code 會自動載入 `.claude/skills/` 內每個 `SKILL.md`。

在你的 Hyday vault 資料夾（或者你習慣啟動 Claude Code 的位置）：

```sh
# 先 clone 一次
git clone https://github.com/mukiwu/hyday-skills.git ~/hyday-skills

# 裝進某個 Claude Code 工作目錄
mkdir -p .claude/skills
cp -R ~/hyday-skills/skills/* .claude/skills/

# （可選）順便裝白板 MCP server
cp -R ~/hyday-skills/mcp-servers .claude/
cd .claude/mcp-servers/hyday-whiteboard && npm install && cd -
```

之後在 `.mcp.json` 加 MCP server 設定（細節見 [`mcp-servers/hyday-whiteboard/README.md`](mcp-servers/hyday-whiteboard/README.md)）。完整參考見 [Claude Skills 文件](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)。

#### Codex CLI

把 `skills/` 目錄複製到 Codex 的 skills 路徑（通常是 `~/.codex/skills/`）：

```sh
git clone https://github.com/mukiwu/hyday-skills.git /tmp/hyday-skills
mkdir -p ~/.codex/skills
cp -R /tmp/hyday-skills/skills/* ~/.codex/skills/
```

格式細節見 [Agent Skills 規範](https://agentskills.io/specification)。

#### OpenCode

把整份 repo clone 進 `~/.opencode/skills/`：

```sh
git clone https://github.com/mukiwu/hyday-skills.git ~/.opencode/skills/hyday-skills
```

OpenCode 會自動 discover `SKILL.md`。clone 完重啟 OpenCode 即可。

## Skills

| Skill | 說明 |
|-------|-----|
| [hyday-markdown](skills/hyday-markdown) | 寫 Hyday 風格的 Markdown——frontmatter、note types、內聯 `#tag` / `@(entity)` / `[[backlink]]` 語法、callouts、math、Mermaid 圖表。 |
| [hyday-lifelog](skills/hyday-lifelog) | 用五個 Life Log 標記寫日誌：`>()` 開始、`<()` 結束、`-()` 當下、`%()` 想法、`!()` 重要。 |
| [hyday-vault-layout](skills/hyday-vault-layout) | 認識資料夾規範——日誌、一般筆記、範本、附件各自放哪，以及哪些檔案 agent 不該動。 |
| [hyday-whiteboard](skills/hyday-whiteboard) | 透過內附的 `hyday-whiteboard` MCP server 程式化操作白板——新增卡片、便利貼、群組、連線。 |

## 內附的 MCP server

`hyday-whiteboard` skill 需要搭配 **`hyday-whiteboard` MCP server**，附在這份 repo 的 [`mcp-servers/hyday-whiteboard/`](mcp-servers/hyday-whiteboard) 目錄。設定一次即可：

1. `cd mcp-servers/hyday-whiteboard && npm install`
2. 在你的 agent `.mcp.json` 加一條設定，指向 `mcp-servers/hyday-whiteboard/whiteboard-server.cjs`（範例見 [`mcp-servers/hyday-whiteboard/README.md`](mcp-servers/hyday-whiteboard/README.md)）。
3. Server 會自動從 `settings.json` 偵測 Hyday vault；如果你有多個 vault，可用 `--data-root` 指定。

其他三個 skill（`hyday-markdown`、`hyday-lifelog`、`hyday-vault-layout`）只操作純 `.md` 檔案，不需要 MCP server——靠 agent 內建的 file tool 就能用。

## 用來做什麼

這份 skill 集合是給 **想用 AI 終端 agent（Claude Code / Codex / OpenCode）讀寫 Hyday 筆記的使用者**。安裝後：

- 「幫我把今天的會議筆記寫成一個 Hyday 筆記」→ agent 產出 frontmatter 正確的 `.md` 檔。
- 「把這篇文章存成 link note，加上 #reading 標籤」→ agent 建立 `link` 型筆記，附正確的 `sourceUrl`、`sourceTitle` 等欄位。
- 「幫我把今天的日誌寫起來，我上午處理 inbox、下午做了 migration」→ agent 寫 `journal/2026/2026-05-17.md`，附上恰當的 Life Log 標記。
- 「幫我做一張白板來回顧 Q3 讀的書」→ agent 用 MCP server 建立筆記、放成卡片、分組、畫連線——直接出現在你的白板上，不用手動擺位。

這份 skill **不**涵蓋 Hyday 外掛/主題開發或內部架構，聚焦在「使用者怎麼用 AI 記錄跟整理筆記」這條使用者導向的工作流。

## 貢獻

歡迎提 issue 或 PR——詳見 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT
