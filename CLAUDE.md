# DriftCLI — Project Context

> Version: 0.1.0
> Built: 2026-03-04

---

## What It Is

A Node.js CLI tool + MCP server that monitors AI conversation drift in real-time for Claude Code sessions. It reads Claude Code's JSONL session files directly, runs the same 7-factor drift algorithm as DriftGuard (the Chrome extension), and exposes the score via MCP tools that Claude Code can call on demand.

No browser, no API keys, no UI. Just a score in your terminal or via tool call.

---

## Architecture

```
~/.claude/projects/<project>/<session-uuid>.jsonl
  └─ claude-parser.ts       (JSONL → Message[])
       └─ drift-calculator.ts  (7-factor scoring, ported from DriftGuard)
            └─ state (in-memory, recalculated on each call)
                 ↑
           mcp-server.ts    (MCP stdio transport)
             ├─ tool: get_drift()     → score + factor breakdown
             └─ tool: get_handoff()   → handoff prompt for starting fresh
```

The MCP server is spawned automatically by Claude Code via `~/.claude.json` config. No separate process needed.

---

## File Map

| File | What it does |
|------|-------------|
| `src/bin.ts` | Entry point. Dispatches `driftguard-mcp watch` to CLI watcher, otherwise starts MCP server. |
| `src/mcp-server.ts` | MCP server. Registers tools, handles tool calls, reads session and returns drift analysis. |
| `src/cli.ts` | Standalone CLI watcher. Polls latest session every 3s and prints score to stdout. |
| `src/watchers/claude-parser.ts` | Parses Claude Code JSONL files into `Message[]`. Handles both string and array content formats. |
| `src/watchers/session-resolver.ts` | Priority-chain session resolver: env var → CWD match → global newest file. |
| `src/watchers/adapter.ts` | `ParserAdapter` interface + re-exports `ParsedMessage`. |
| `src/watchers/claude-adapter.ts` | Claude CLI adapter. |
| `src/watchers/gemini-adapter.ts` | Gemini CLI adapter (`role:model` → `assistant`). |
| `src/watchers/codex-adapter.ts` | Codex CLI adapter. |
| `src/watchers/adapter-registry.ts` | `ADAPTERS` array + `detectAdapter()`. |
| `src/core/types.ts` | All shared types, `DEFAULT_WEIGHTS`, `scoreToLevel()`. |
| `src/core/drift-calculator.ts` | Main 7-factor drift algorithm. Pure, synchronous. |
| `src/core/topic-analyzer.ts` | TF-IDF vectors, cosine similarity, n-gram extraction. |
| `src/core/contradiction-detector.ts` | Regex-based self-correction detection across 6 languages. |
| `src/core/confidence-analyzer.ts` | Hedging language density and trend analysis. |

---

## The 7 Drift Factors

| Factor | Key | Default Weight |
|--------|-----|----------------|
| Context Saturation | `contextSaturation` | 0.20 |
| Topic Scatter | `topicScatter` | 0.12 |
| Uncertainty Signals | `uncertaintySignals` | 0.15 |
| Code Inconsistency | `codeInconsistency` | 0.08 |
| Repetition | `repetition` | 0.20 |
| Goal Distance | `goalDistance` | 0.15 |
| Confidence Drift | `confidenceDrift` | 0.10 |

Score thresholds: fresh 0–29 | warming 30–60 | drifting 61–80 | polluted 81–100

---

## MCP Config

**Installed (recommended):**
```json
"mcpServers": {
  "driftcli": {
    "command": "driftguard-mcp"
  }
}
```

**Dev (tsx — no build step required):**
```json
"mcpServers": {
  "driftcli": {
    "command": "cmd",
    "args": ["/c", "npx", "tsx", "<path-to-repo>/src/mcp-server.ts"]
  }
}
```

**Dev (pre-compiled bundle):**
```json
"mcpServers": {
  "driftcli": {
    "command": "node",
    "args": ["<path-to-repo>/dist/bin.js"]
  }
}
```
Run `npm run build` after pulling changes to regenerate `dist/bin.js`.

---

## MCP Tools

### `get_drift()`
Returns the current drift score and all 7 factor scores for the active session. When score > warnThreshold, automatically includes a handoff prompt inline.

### `get_handoff()`
Generates a structured handoff prompt based on top topics and the last 3 user messages.

### `get_trend()`
Returns drift history with sparkline, peak, average, and trajectory.

---

## Running

```bash
# MCP mode (automatic via Claude Code)
# Just use Claude Code normally and call get_drift() when needed

# CLI watcher (standalone terminal dashboard)
driftguard-mcp watch

# Dev CLI watcher
npm start
```

---

## Key Design Decisions

- **File watcher, not AI self-report** — drift is calculated from the raw JSONL, not from Claude's own assessment. Objective and consistent.
- **Ported core from DriftGuard** — the `src/core/` files are direct ports of the Chrome extension's algorithm. No browser APIs, no changes to the logic.
- **CWD-based session detection** — `findSessionByCwd()` scopes the session to the current project directory, avoiding cross-window contamination.
- **Content format handling** — Claude Code writes user messages as plain strings but assistant messages as content arrays. The parser handles both.
