import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DriftAnalysis } from './core/types';

// ============================================================
// Types
// ============================================================

export interface DriftSnapshot {
  score: number;
  level: string;
  factors: Record<string, number>;
  messageCount: number;
  sessionDuration: number;
  calculatedAt: number;
}

// ============================================================
// Storage class
// ============================================================

/**
 * Lightweight JSON-Lines persistence for drift snapshots.
 *
 * Layout:  <dataDir>/<session-key>.jsonl
 *   - <session-key> = JSONL filename without extension (the session UUID)
 *   - One snapshot per line, appended on each get_drift() call
 *
 * Disabled by default (storage.enabled = false in config).
 * Set storage.enabled = true in ~/.driftclirc to activate.
 */
export class Storage {
  private readonly dir: string;

  constructor(directory?: string) {
    this.dir = directory ?? path.join(
      process.env.DRIFTCLI_HOME ?? os.homedir(),
      '.driftcli',
      'history',
    );
  }

  /** Derive the storage path for a given session key. */
  sessionPath(sessionKey: string): string {
    return path.join(this.dir, `${sessionKey}.jsonl`);
  }

  /** Append a drift snapshot for a session. Creates the directory if needed. */
  record(sessionKey: string, analysis: DriftAnalysis): void {
    try {
      if (!fs.existsSync(this.dir)) {
        fs.mkdirSync(this.dir, { recursive: true });
      }
      const snapshot: DriftSnapshot = {
        score:           analysis.score,
        level:           analysis.level,
        factors:         { ...analysis.factors } as unknown as Record<string, number>,
        messageCount:    analysis.messageCount,
        sessionDuration: analysis.sessionDuration,
        calculatedAt:    analysis.calculatedAt,
      };
      fs.appendFileSync(this.sessionPath(sessionKey), JSON.stringify(snapshot) + '\n', 'utf-8');
    } catch (err) {
      console.warn(`[driftcli] Storage write failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  /** Read the last `limit` snapshots for a session. Returns [] if no history exists. */
  getHistory(sessionKey: string, limit = 20): DriftSnapshot[] {
    const filePath = this.sessionPath(sessionKey);
    if (!fs.existsSync(filePath)) return [];

    try {
      const snapshots: DriftSnapshot[] = [];
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(l => l.trim());
      for (const line of lines) {
        try {
          snapshots.push(JSON.parse(line) as DriftSnapshot);
        } catch {
          // skip malformed lines silently
        }
      }
      return snapshots.slice(-limit);
    } catch (err) {
      console.warn(`[driftcli] Storage read failed: ${err instanceof Error ? err.message : err}`);
      return [];
    }
  }

  /** Delete history for a session (e.g. after a handoff/reset). */
  clearHistory(sessionKey: string): void {
    const filePath = this.sessionPath(sessionKey);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      console.warn(`[driftcli] Storage clear failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
