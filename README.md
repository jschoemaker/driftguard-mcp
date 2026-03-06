# driftguard-mcp

Real-time AI conversation drift monitor — MCP server for Claude Code, Gemini CLI, Codex CLI, and Cursor.

Reads your session directly, scores it across 7 factors, and exposes the result as MCP tools you can call mid-session. No browser, no API keys, no UI — just a score when you need it.

---

## Install

```bash
npm install -g driftguard-mcp
driftguard-mcp setup
```

`setup` automatically configures all supported AI CLIs on your machine. Restart your AI CLI(s) after running it.

<details>
<summary>Manual config (if you prefer)</summary>

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

### Codex CLI — `~/.codex/config.json`

```json
{
  "mcpServers": {
    "driftguard": {
      "command": "driftguard-mcp",
      "env": { "DRIFTCLI_ADAPTER": "codex" }
    }
  }
}
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

> Note: Cursor drift is calculated from Claude Code sessions on your machine — not from Cursor's own conversation history.

> **`DRIFTCLI_ADAPTER`** tells driftguard-mcp which CLI's sessions to read. Without it, the server falls back to whichever session file was modified most recently, which may be from a different CLI. `driftguard-mcp setup` sets this automatically.

</details>

---

## Usage

Call the tools directly from any session:

- **`get_drift()`** — check the current drift score
- **`get_handoff()`** — generate a handoff prompt when drift is high
- **`get_trend()`** — see the full score history for this session

---

## What is drift?

Long AI sessions degrade. The model starts repeating itself, losing track of the original goal, hedging more, and producing inconsistent code. driftguard-mcp measures this in real time across 7 factors:

| Factor | What it measures |
|--------|-----------------|
| Context Saturation | How full the context window is getting |
| Topic Scatter | How far the conversation has wandered from its starting topics |
| Uncertainty Signals | Hedging language density |
| Code Inconsistency | Conflicting patterns across code blocks |
| Repetition | Rehashing of earlier content |
| Goal Distance | Drift from the original user intent |
| Confidence Drift | Declining confidence over the session |

Score thresholds: **fresh** 0–29 | **warming** 30–60 | **drifting** 61–80 | **polluted** 81–100

---

## Tools

### `get_drift()`

Returns the current drift score and factor breakdown for the active session. When drift exceeds the warn threshold, a handoff prompt is included automatically so you can start fresh without a separate call.

```
Drift Score: 59 WARMING
Messages: 42

Factor breakdown:
  contextSaturation: 72.0
  topicScatter: 50.0
  uncertaintySignals: 31.0
  codeInconsistency: 12.0
  repetition: 0.0
  goalDistance: 44.0
  confidenceDrift: 2.0

Context is healthy.
Trend (last 8): ▁▃▅▆▇  +12 over 8 checks ↗
```

### `get_handoff()`

Generates a structured handoff prompt. Summarises top topics, recent messages, and the last code block. Paste it into a new session in any supported AI CLI to continue without losing context.

### `get_trend()`

Shows the full drift history for the current session — sparkline, score sequence, peak, average, and trajectory.

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
| `coding` | Focused coding sessions — weights code consistency and repetition |
| `research` | Research or planning — weights topic stability and goal alignment |
| `brainstorm` | Brainstorming — relaxed topic scatter penalty |
| `strict` | Equal weight across all seven factors |

### All options

| Key | Default | Description |
|-----|---------|-------------|
| `preset` | — | Named weight preset (see above) |
| `weights` | — | Per-factor weight overrides, applied on top of preset |
| `warnThreshold` | `60` | Score at which `get_drift()` warns and includes a handoff prompt |
| `storage.enabled` | `true` | Persist drift snapshots for `get_trend()` and sparklines |
| `storage.directory` | `~/.driftcli/history` | Override snapshot storage path |
| `sessionResolution.cacheTtlMs` | `5000` | How long to cache the resolved session file (ms) |

### Environment variables

| Variable | Description |
|----------|-------------|
| `DRIFTCLI_ADAPTER` | Pin session lookup to a specific CLI: `claude`, `gemini`, or `codex`. Set automatically by `driftguard-mcp setup`. |
| `DRIFTCLI_SESSION_ID` | Force a specific session UUID (Claude Code only). |
| `DRIFTCLI_HOME` | Override the home directory used for session file discovery. |

---

## CLI watcher

For a live terminal dashboard that polls every 3 seconds, open a separate terminal and run:

```bash
driftguard-mcp watch
```

---

## Supported CLIs

| CLI | Status |
|-----|--------|
| Claude Code | Supported |
| Gemini CLI | Supported |
| Codex CLI | Supported |
| Cursor | Supported (monitors Claude Code / Gemini / Codex sessions) |
