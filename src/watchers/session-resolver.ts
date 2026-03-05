import { findLatestSession, findSessionByUUID, findSessionByCwd } from './claude-parser';
import { ParserAdapter } from './adapter';
import { ClaudeAdapter } from './claude-adapter';
import { detectAdapter } from './adapter-registry';

/**
 * Resolves the active session file using a priority chain:
 *
 *   1. DRIFTCLI_SESSION_ID env var — explicit session UUID set by the user
 *   2. CWD match — most recently modified .jsonl scoped to the current project dir
 *   3. Newest-file fallback — most recently modified .jsonl across all projects
 *
 * Results are cached for `cacheTtlMs` milliseconds to avoid repeated fs scans
 * on back-to-back tool calls within the same turn.
 */
export class SessionResolver {
  private cached: { file: string; expiresAt: number } | null = null;
  private readonly adapter: ParserAdapter;

  constructor(
    private readonly cacheTtlMs: number = 5000,
    adapter?: ParserAdapter,
  ) {
    this.adapter = adapter ?? new ClaudeAdapter();
  }

  resolve(): string | null {
    if (this.cached && this.cached.expiresAt > Date.now()) {
      return this.cached.file;
    }

    const result = this.resolveFromEnv() ?? this.resolveFromCwd() ?? findLatestSession();

    if (result) {
      this.cached = { file: result, expiresAt: Date.now() + this.cacheTtlMs };
    } else {
      this.cached = null;
    }

    return result;
  }

  /** Return the adapter to use for parsing the resolved session file. */
  getAdapter(filePath?: string): ParserAdapter {
    if (filePath) return detectAdapter(filePath);
    return this.adapter;
  }

  /** Force the next call to re-resolve rather than use the cache. */
  invalidate(): void {
    this.cached = null;
  }

  private resolveFromCwd(): string | null {
    const file = findSessionByCwd();
    if (file && process.env.DRIFTCLI_DEBUG) {
      const slug = file.split(/[\\/]/).slice(-2, -1)[0];
      console.warn(`[driftcli] Session resolved via CWD match: ${slug}`);
    }
    return file;
  }

  private resolveFromEnv(): string | null {
    const sessionId = process.env.DRIFTCLI_SESSION_ID;
    if (!sessionId) return null;

    const found = findSessionByUUID(sessionId);
    if (!found) {
      console.warn(`[driftcli] DRIFTCLI_SESSION_ID="${sessionId}" set but no matching .jsonl found — falling back to newest file`);
    }
    return found;
  }
}
