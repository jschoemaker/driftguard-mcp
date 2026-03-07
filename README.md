# driftguard-mcp

Real-time AI conversation drift monitor for Claude Code, Gemini CLI, Codex CLI, and Cursor.

Long AI sessions degrade — the model fills its context window, starts repeating itself, and loses track of what you originally asked for. driftguard-mcp reads your session file directly, measures the signals that actually predict this, and tells you when to start fresh.

No browser. No API keys. No UI. Works as an MCP server your AI CLI can call mid-session.

---

## Install

```bash
npm install -g driftguard-mcp
driftguard-mcp setup
```

`setup` automatically configures all supported AI CLIs on your machine. Restart your AI CLI(s) after running it.

<details>
<summary>Manual config</summary>

### Claude Code — `~/.claude.json`

```json
{
  "mcpServers": {
    "driftguard": {
      "command": "driftguard-mcp",
      "env": { "DRIFTCLI_ADAPTER": "claude" }
    }
  }
}
```

### Gemini CLI — `~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "driftguard": {
      "command": "driftguard-mcp",
      "env": { "DRIFTCLI_ADAPTER": "gemini" }
    }
  }
}
```

### Codex CLI — `~/.codex/config.toml`

```toml
[mcp_servers.driftguard]
command = "driftguard-mcp"
env.DRIFTCLI_ADAPTER = "codex"
```

### Cursor — `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "driftguard": {
      "command": "driftguard-mcp",
      "env": { "DRIFTCLI_ADAPTER": "claude" }
    }
  }
}
```

> **`DRIFTCLI_ADAPTER`** tells driftguard-mcp which CLI's sessions to read. `driftguard-mcp setup` sets this automatically.

</details>

---

## Usage

Call these tools from any session:

- **`get_drift()`** — check if the session is degrading
- **`get_handoff()`** — write a `handoff.md` to continue in a fresh session
- **`get_trend()`** — full score history with sparkline

---

## What it looks like

**Healthy session:**

```
✅  Context is healthy.

  Context depth         ███░░░░░░░   28
  Repetition            ██░░░░░░░░   15

Score: 12/100 · 14 messages
```

**Session that needs a reset:**

```
⚠️  Start fresh now — context is full and responses are repeating heavily.

  Context depth         █████████░   88
  Repetition            ████████░░   72
  Length collapse       █████░░░░░   48

Score: 84/100 · 67 messages

→ Call get_handoff() to write handoff.md before starting fresh.
```

The score leads with a plain-English recommendation. The two bars that matter most — context depth and repetition — always appear. Others only show when they're contributing something meaningful.

## See it in action

[![driftguard-mcp demo](https://img.youtube.com/vi/NQcMkPxkcho/maxresdefault.jpg)](https://www.youtube.com/watch?v=NQcMkPxkcho)

---

## Handoff workflow

When drift is high, call `get_handoff()`. The AI writes a `handoff.md` in your project root using its full session context:

```markdown
## What we accomplished
Implemented JWT authentication with refresh token rotation. Added middleware,
updated the user model, wrote integration tests. All tests passing.

## Current state
Auth flow is working end-to-end. Rate limiting is stubbed but not implemented.
The `/refresh` endpoint has a known edge case with concurrent requests (see TODO in auth.ts:142).

## Files modified
- src/middleware/auth.ts — JWT verify + refresh logic
- src/models/user.ts — added refreshToken field + index
- src/routes/auth.ts — /login, /logout, /refresh endpoints
- tests/integration/auth.test.ts — 14 new tests

## Open questions / next steps
- Implement rate limiting on /login (decided on: 5 attempts per 15 min)
- Fix concurrent refresh edge case
- Add token blacklist for logout

## Context for next session
Using jsonwebtoken@9, refresh tokens stored in DB (not Redis — decision was made
to keep it simple for now). Access token TTL: 15min. Refresh TTL: 7 days.
```

Load `handoff.md` at the start of your next session. You continue without losing context.

---

## What it measures

The score is driven primarily by two signals that reliably predict context degradation:

| Factor | Weight | What it measures |
|--------|--------|-----------------|
| **Context depth** | 37% | Token volume in the session (real API counts for Claude and Gemini) |
| **Repetition** | 37% | 3-gram overlap across recent assistant responses — the model recycling its own output |
| Response length collapse | 15% | Assistant responses getting shorter over time |
| Goal distance | 8% | Vocabulary drift from your stated goal (pass `goal` param to activate) |
| Uncertainty signals | 2% | Explicit self-corrections ("I was wrong", "let me correct that") |
| Confidence drift | 1% | Hedging language trend (early vs late responses) |

Context depth and repetition together are the clearest signs the model is running out of useful context. The others contribute supporting signal but don't dominate the score.

---

## `get_drift()` options

Pass an optional `goal` string to anchor the goal distance measurement to a specific objective:

```
get_drift({ goal: "build a JWT authentication system" })
```

Without it, goal distance returns 0 (no anchor = no measurement).

---

## Configuration

driftguard-mcp looks for config in two places, merged together:

- **Global:** `~/.driftclirc`
- **Per-project:** `.driftcli` in the project root

Both are plain JSON. All fields are optional.

```json
{
  "preset": "coding",
  "warnThreshold": 60
}
```

### Presets

| Preset | Best for |
|--------|----------|
| `coding` | Focused coding sessions |
| `research` | Research or planning — weights topic stability and goal alignment |
| `brainstorm` | Brainstorming — relaxed topic scatter penalty |
| `strict` | Equal weight across all six factors |

### All options

| Key | Default | Description |
|-----|---------|-------------|
| `preset` | — | Named weight preset |
| `weights` | — | Per-factor weight overrides, applied on top of preset |
| `warnThreshold` | `60` | Score threshold for warnings |
| `storage.enabled` | `true` | Persist drift snapshots for `get_trend()` |
| `storage.directory` | `~/.driftcli/history` | Override snapshot storage path |
| `sessionResolution.cacheTtlMs` | `5000` | Session file cache TTL (ms) |

### Environment variables

| Variable | Description |
|----------|-------------|
| `DRIFTCLI_ADAPTER` | Pin to a specific CLI: `claude`, `gemini`, or `codex`. Set automatically by `setup`. |
| `DRIFTCLI_SESSION_ID` | Force a specific session UUID (Claude Code only). |
| `DRIFTCLI_HOME` | Override home directory for session file discovery. |

---

## CLI watcher

Live terminal dashboard, polls every 3 seconds:

```bash
driftguard-mcp watch
```

---

## Supported CLIs

| CLI | Status |
|-----|--------|
| Claude Code | ✅ Supported — real token counts |
| Gemini CLI | ✅ Supported — real token counts |
| Codex CLI | ✅ Supported — estimated token counts |
| Cursor | ✅ Supported (monitors Claude Code / Gemini / Codex sessions) |
