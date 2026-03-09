/**
 * Unit tests for mcp-server helper functions.
 *
 * The MCP server module exports no functions directly (only main()), so we
 * test the logic through the public output it produces. Where the code is
 * not exportable, we replicate the minimal logic here to keep tests pure
 * and fast (no I/O, no MCP transport needed).
 */
import { describe, it, expect } from 'vitest';
import { Storage } from '../../src/storage';
import { sparkline } from '../../src/ui';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// ─── Inline helpers matching mcp-server.ts (not exported, tested via logic) ───

function bar(score: number, width = 10): string {
  const filled = Math.round(Math.min(100, Math.max(0, score)) / 100 * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

// ─── bar() ────────────────────────────────────────────────────────────────────

describe('bar()', () => {
  it('returns all empty for score 0', () => {
    expect(bar(0)).toBe('░░░░░░░░░░');
  });

  it('returns all filled for score 100', () => {
    expect(bar(100)).toBe('██████████');
  });

  it('returns half filled for score 50', () => {
    expect(bar(50)).toBe('█████░░░░░');
  });

  it('clamps negative scores to 0', () => {
    expect(bar(-10)).toBe('░░░░░░░░░░');
  });

  it('clamps scores above 100 to full bar', () => {
    expect(bar(200)).toBe('██████████');
  });

  it('respects custom width', () => {
    const result = bar(50, 4);
    expect(result.length).toBe(4);
    expect(result).toBe('██░░');
  });
});

// ─── sparkline() ──────────────────────────────────────────────────────────────

describe('sparkline()', () => {
  it('returns a string of the same length as the input', () => {
    const scores = [10, 20, 50, 80, 100];
    const line = sparkline(scores);
    expect(line.length).toBe(scores.length);
  });

  it('uses lowest block for zero score', () => {
    const line = sparkline([0, 100]);
    expect(line[0]).toBe('▁');
  });

  it('uses highest block for max score', () => {
    const line = sparkline([0, 100]);
    expect(line[1]).toBe('█');
  });

  it('returns empty string for empty input', () => {
    expect(sparkline([])).toBe('');
  });
});

// ─── Storage.sessionPath() validation ─────────────────────────────────────────

describe('Storage.sessionPath() validation', () => {
  const tmpDir = path.join(os.tmpdir(), `drift-mcp-test-${Date.now()}`);
  const storage = new Storage(tmpDir);

  it('accepts valid UUID-like session keys', () => {
    expect(() => storage.sessionPath('abc123-XYZ_session')).not.toThrow();
  });

  it('rejects keys with path traversal characters', () => {
    expect(() => storage.sessionPath('../evil')).toThrow();
  });

  it('rejects keys with slashes', () => {
    expect(() => storage.sessionPath('foo/bar')).toThrow();
  });

  it('rejects empty string keys', () => {
    expect(() => storage.sessionPath('')).toThrow();
  });

  it('rejects keys longer than 100 characters', () => {
    expect(() => storage.sessionPath('a'.repeat(101))).toThrow();
  });

  it('returns a path ending in <key>.jsonl', () => {
    const p = storage.sessionPath('my-session-01');
    expect(p.endsWith('my-session-01.jsonl')).toBe(true);
  });
});

// ─── Storage round-trip ───────────────────────────────────────────────────────

describe('Storage.record / getHistory', () => {
  const tmpDir = path.join(os.tmpdir(), `drift-mcp-roundtrip-${Date.now()}`);

  it('records a snapshot and retrieves it', () => {
    const storage = new Storage(tmpDir);
    const analysis = {
      score: 42,
      level: 'warming' as const,
      factors: {
        contextSaturation: 30,
        repetition: 20,
        responseLengthCollapse: 5,
        goalDistance: 10,
        uncertaintySignals: 8,
        confidenceDrift: 6,
      },
      weights: {} as never,
      messageCount: 10,
      sessionDuration: 60000,
      calculatedAt: Date.now(),
      recommendations: [],
      goalDrift: { checkpoints: [], trajectory: 'stable' as const, averageScore: 0, startToEndDrift: 0 },
    };

    storage.record('test-session', analysis);
    const history = storage.getHistory('test-session');
    expect(history.length).toBe(1);
    expect(history[0].score).toBe(42);
    expect(history[0].level).toBe('warming');
  });

  it('getHistory returns [] when no history exists', () => {
    const storage = new Storage(tmpDir);
    expect(storage.getHistory('nonexistent-session')).toEqual([]);
  });

  it('respects the limit parameter', () => {
    const storage = new Storage(tmpDir);
    const key = 'limit-test';
    const stub = {
      score: 10, level: 'fresh' as const,
      factors: { contextSaturation: 0, repetition: 0, responseLengthCollapse: 0, goalDistance: 0, uncertaintySignals: 0, confidenceDrift: 0 },
      weights: {} as never, messageCount: 1, sessionDuration: 0, calculatedAt: Date.now(),
      recommendations: [],
      goalDrift: { checkpoints: [], trajectory: 'stable' as const, averageScore: 0, startToEndDrift: 0 },
    };
    // record 5 snapshots
    for (let i = 0; i < 5; i++) storage.record(key, { ...stub, score: i * 10 });
    const history = storage.getHistory(key, 3);
    expect(history.length).toBe(3);
    // last 3 of scores 0,10,20,30,40 → 20,30,40
    expect(history[2].score).toBe(40);

    // clean up
    storage.clearHistory(key);
  });
});
