import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Storage } from '../../src/storage';
import { DriftAnalysis } from '../../src/core/types';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'driftcli-storage-test-'));
}

function makeAnalysis(overrides: Partial<DriftAnalysis> = {}): DriftAnalysis {
  return {
    score: 42,
    level: 'warming',
    factors: {
      contextSaturation:     20,
      uncertaintySignals:    10,
      repetition:            30,
      goalDistance:          12,
      confidenceDrift:        8,
      responseLengthCollapse: 0,
    },
    messageCount:    10,
    sessionDuration: 60_000,
    calculatedAt:    Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------

describe('Storage', () => {
  let tmpDir: string;
  let storage: Storage;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    storage = new Storage(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // --- record() ---

  it('creates the storage directory if it does not exist', () => {
    const nested = path.join(tmpDir, 'deep', 'nested');
    const s = new Storage(nested);
    s.record('sess1', makeAnalysis());
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('creates a .jsonl file named after the session key', () => {
    storage.record('mysession', makeAnalysis());
    expect(fs.existsSync(path.join(tmpDir, 'mysession.jsonl'))).toBe(true);
  });

  it('appends one JSON line per record call', () => {
    storage.record('s1', makeAnalysis({ score: 10 }));
    storage.record('s1', makeAnalysis({ score: 20 }));
    storage.record('s1', makeAnalysis({ score: 30 }));

    const lines = fs.readFileSync(path.join(tmpDir, 's1.jsonl'), 'utf-8')
      .split('\n').filter(l => l.trim());
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).score).toBe(10);
    expect(JSON.parse(lines[1]).score).toBe(20);
    expect(JSON.parse(lines[2]).score).toBe(30);
  });

  it('stores all DriftSnapshot fields correctly', () => {
    const analysis = makeAnalysis({ score: 55, level: 'drifting', messageCount: 99, sessionDuration: 120_000 });
    storage.record('s2', analysis);

    const snap = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 's2.jsonl'), 'utf-8').trim(),
    );
    expect(snap.score).toBe(55);
    expect(snap.level).toBe('drifting');
    expect(snap.messageCount).toBe(99);
    expect(snap.sessionDuration).toBe(120_000);
    expect(typeof snap.calculatedAt).toBe('number');
  });

  it('does not throw when the directory is not writable (graceful failure)', () => {
    // Point storage at a file path (not a directory) — mkdirSync will fail
    const badPath = path.join(tmpDir, 'i-am-a-file');
    fs.writeFileSync(badPath, 'blocker');
    const badStorage = new Storage(path.join(badPath, 'subdir'));
    expect(() => badStorage.record('s3', makeAnalysis())).not.toThrow();
  });

  // --- getHistory() ---

  it('returns [] when no history file exists', () => {
    expect(storage.getHistory('nonexistent')).toEqual([]);
  });

  it('returns stored snapshots in order', () => {
    storage.record('s4', makeAnalysis({ score: 10 }));
    storage.record('s4', makeAnalysis({ score: 20 }));
    storage.record('s4', makeAnalysis({ score: 30 }));

    const history = storage.getHistory('s4');
    expect(history).toHaveLength(3);
    expect(history[0].score).toBe(10);
    expect(history[2].score).toBe(30);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 25; i++) {
      storage.record('s5', makeAnalysis({ score: i }));
    }
    const history = storage.getHistory('s5', 10);
    expect(history).toHaveLength(10);
    // Should be the last 10 entries
    expect(history[0].score).toBe(15);
    expect(history[9].score).toBe(24);
  });

  it('defaults to returning last 20 snapshots', () => {
    for (let i = 0; i < 30; i++) {
      storage.record('s6', makeAnalysis({ score: i }));
    }
    expect(storage.getHistory('s6')).toHaveLength(20);
  });

  it('silently skips malformed lines', () => {
    const filePath = path.join(tmpDir, 's7.jsonl');
    fs.writeFileSync(filePath, [
      JSON.stringify({ score: 10, level: 'fresh', factors: {}, messageCount: 1, sessionDuration: 0, calculatedAt: 0 }),
      '{ this is not json }',
      JSON.stringify({ score: 30, level: 'warming', factors: {}, messageCount: 3, sessionDuration: 0, calculatedAt: 0 }),
    ].join('\n') + '\n');

    const history = storage.getHistory('s7');
    expect(history).toHaveLength(2);
    expect(history[0].score).toBe(10);
    expect(history[1].score).toBe(30);
  });

  // --- clearHistory() ---

  it('deletes the session file', () => {
    storage.record('s8', makeAnalysis());
    expect(fs.existsSync(path.join(tmpDir, 's8.jsonl'))).toBe(true);

    storage.clearHistory('s8');
    expect(fs.existsSync(path.join(tmpDir, 's8.jsonl'))).toBe(false);
  });

  it('does not throw when clearing a nonexistent session', () => {
    expect(() => storage.clearHistory('does-not-exist')).not.toThrow();
  });

  it('getHistory returns [] after clearHistory', () => {
    storage.record('s9', makeAnalysis());
    storage.clearHistory('s9');
    expect(storage.getHistory('s9')).toEqual([]);
  });

  // --- sessionPath() ---

  it('returns the expected path for a session key', () => {
    const p = storage.sessionPath('abc-123');
    expect(p).toBe(path.join(tmpDir, 'abc-123.jsonl'));
  });
});
