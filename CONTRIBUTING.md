# Contributing to Hyday Skills

Thanks for thinking of contributing. This is a small repo of agent skills that teach external CLI agents (Claude Code / Codex CLI / OpenCode) how to correctly read and write a Hyday vault on disk. Contributions that keep skills accurate, concise, and aligned with what Hyday actually does are very welcome.

## What kinds of contributions help

- **Bug reports** — a skill tells an agent to do something Hyday doesn't actually support, or omits something Hyday does support.
- **Skill clarifications** — a section is ambiguous, or an example is wrong / outdated.
- **New skills** — covering a Hyday capability not yet documented (templates, attachments, plugins, etc.).
- **Translations** — currently English + Traditional Chinese; PRs for other locales welcome (see "Translations" below).
- **MCP server fixes** — the `hyday-whiteboard` server in `mcp-servers/` accepts bug fixes that match Hyday's actual storage schema.

## Before opening a PR

1. **Check the existing skills first.** If a skill already covers what you want to add, edit it instead of creating a new file.
2. **Verify against real Hyday behavior.** Open the Hyday desktop app, do the thing you're documenting, and confirm the file format / IPC behavior matches what your skill claims.
3. **Keep skills concise.** The whole point of an agent skill is to surface only what the agent needs. Don't paste a tutorial.

## Skill style

- **Front-load the most important info.** Agents scan top-to-bottom and may stop early.
- **Use tables / lists / short code fences** for syntax references — not prose.
- **Cross-reference between skills** rather than duplicate.
- **Every skill assumes vault-root is already resolved** (see `hyday-vault-layout` Step 0). Don't re-explain it in every skill; just remind the reader at the top.
- **No emoji** in skill content — Hyday's own design language avoids them and agents shouldn't echo emoji back into user notes.

## Frontmatter shape

Every `SKILL.md` starts with YAML frontmatter:

```yaml
---
name: hyday-<topic>
description: <one paragraph describing when this skill applies — match real triggers the user might say>
---
```

The `description` is what an agent uses to decide whether to load the skill. Be specific about trigger words.

## Translations

Translations live as sibling files: `README.zh-TW.md`, `README.<locale>.md`. Each translated README links back to `README.md` at the top.

For SKILL files: the canonical version is English. We keep one source of truth per skill — translations go in language-specific *additions* to that file (a `## 中文摘要` section, for example) rather than duplicate files. This avoids the two-file-drift problem.

## Testing changes

There's no automated test for skill content — agents are non-deterministic and skills are prose. The closest thing to a test is: install your edited skill into Claude Code or Codex, ask the agent to do the thing your skill claims to support, and verify the output is correct.

For MCP server changes:

```sh
cd mcp-servers/hyday-whiteboard
npm install
# Smoke test by pointing Claude Code at it and calling listWhiteboards
```

## Release flow

The version string lives in **two** Claude Code plugin manifests:

- `.claude-plugin/marketplace.json` → `plugins[0].version`
- `.claude-plugin/plugin.json` → `version`

To keep them in sync, use the helper:

```sh
node scripts/bump-version.mjs 0.2.0
```

Then the usual:

```sh
git add .claude-plugin/
git commit -m "chore: bump version to v0.2.0"
git push
gh release create v0.2.0 --title "v0.2.0 — <summary>" --notes "..."
```

If you forget to bump the manifest before releasing, `/plugin install` will still work but show the old version label in the marketplace — annoying but not broken.

## Code of conduct

Be kind. The skills here aim to make people's daily note-taking smoother — let's keep the contribution experience the same.

## License

By contributing, you agree your contributions will be licensed under the MIT License (see `LICENSE`).
