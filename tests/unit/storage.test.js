"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const storage_1 = require("../../src/storage");
// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'driftcli-storage-test-'));
}
function makeAnalysis(overrides = {}) {
    return {
        score: 42,
        level: 'warming',
        factors: {
            contextSaturation: 20,
            uncertaintySignals: 10,
            repetition: 30,
            goalDistance: 12,
            confidenceDrift: 8,
            responseLengthCollapse: 0,
        },
        messageCount: 10,
        sessionDuration: 60000,
        calculatedAt: Date.now(),
        ...overrides,
    };
}
// ---------------------------------------------------------------
// Tests
// ---------------------------------------------------------------
(0, vitest_1.describe)('Storage', () => {
    let tmpDir;
    let storage;
    (0, vitest_1.beforeEach)(() => {
        tmpDir = makeTmpDir();
        storage = new storage_1.Storage(tmpDir);
    });
    (0, vitest_1.afterEach)(() => {
        if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
    // --- record() ---
    (0, vitest_1.it)('creates the storage directory if it does not exist', () => {
        const nested = path.join(tmpDir, 'deep', 'nested');
        const s = new storage_1.Storage(nested);
        s.record('sess1', makeAnalysis());
        (0, vitest_1.expect)(fs.existsSync(nested)).toBe(true);
    });
    (0, vitest_1.it)('creates a .jsonl file named after the session key', () => {
        storage.record('mysession', makeAnalysis());
        (0, vitest_1.expect)(fs.existsSync(path.join(tmpDir, 'mysession.jsonl'))).toBe(true);
    });
    (0, vitest_1.it)('appends one JSON line per record call', () => {
        storage.record('s1', makeAnalysis({ score: 10 }));
        storage.record('s1', makeAnalysis({ score: 20 }));
        storage.record('s1', makeAnalysis({ score: 30 }));
        const lines = fs.readFileSync(path.join(tmpDir, 's1.jsonl'), 'utf-8')
            .split('\n').filter(l => l.trim());
        (0, vitest_1.expect)(lines).toHaveLength(3);
        (0, vitest_1.expect)(JSON.parse(lines[0]).score).toBe(10);
        (0, vitest_1.expect)(JSON.parse(lines[1]).score).toBe(20);
        (0, vitest_1.expect)(JSON.parse(lines[2]).score).toBe(30);
    });
    (0, vitest_1.it)('stores all DriftSnapshot fields correctly', () => {
        const analysis = makeAnalysis({ score: 55, level: 'drifting', messageCount: 99, sessionDuration: 120000 });
        storage.record('s2', analysis);
        const snap = JSON.parse(fs.readFileSync(path.join(tmpDir, 's2.jsonl'), 'utf-8').trim());
        (0, vitest_1.expect)(snap.score).toBe(55);
        (0, vitest_1.expect)(snap.level).toBe('drifting');
        (0, vitest_1.expect)(snap.messageCount).toBe(99);
        (0, vitest_1.expect)(snap.sessionDuration).toBe(120000);
        (0, vitest_1.expect)(typeof snap.calculatedAt).toBe('number');
    });
    (0, vitest_1.it)('does not throw when the directory is not writable (graceful failure)', () => {
        // Point storage at a file path (not a directory) — mkdirSync will fail
        const badPath = path.join(tmpDir, 'i-am-a-file');
        fs.writeFileSync(badPath, 'blocker');
        const badStorage = new storage_1.Storage(path.join(badPath, 'subdir'));
        (0, vitest_1.expect)(() => badStorage.record('s3', makeAnalysis())).not.toThrow();
    });
    // --- getHistory() ---
    (0, vitest_1.it)('returns [] when no history file exists', () => {
        (0, vitest_1.expect)(storage.getHistory('nonexistent')).toEqual([]);
    });
    (0, vitest_1.it)('returns stored snapshots in order', () => {
        storage.record('s4', makeAnalysis({ score: 10 }));
        storage.record('s4', makeAnalysis({ score: 20 }));
        storage.record('s4', makeAnalysis({ score: 30 }));
        const history = storage.getHistory('s4');
        (0, vitest_1.expect)(history).toHaveLength(3);
        (0, vitest_1.expect)(history[0].score).toBe(10);
        (0, vitest_1.expect)(history[2].score).toBe(30);
    });
    (0, vitest_1.it)('respects the limit parameter', () => {
        for (let i = 0; i < 25; i++) {
            storage.record('s5', makeAnalysis({ score: i }));
        }
        const history = storage.getHistory('s5', 10);
        (0, vitest_1.expect)(history).toHaveLength(10);
        // Should be the last 10 entries
        (0, vitest_1.expect)(history[0].score).toBe(15);
        (0, vitest_1.expect)(history[9].score).toBe(24);
    });
    (0, vitest_1.it)('defaults to returning last 20 snapshots', () => {
        for (let i = 0; i < 30; i++) {
            storage.record('s6', makeAnalysis({ score: i }));
        }
        (0, vitest_1.expect)(storage.getHistory('s6')).toHaveLength(20);
    });
    (0, vitest_1.it)('silently skips malformed lines', () => {
        const filePath = path.join(tmpDir, 's7.jsonl');
        fs.writeFileSync(filePath, [
            JSON.stringify({ score: 10, level: 'fresh', factors: {}, messageCount: 1, sessionDuration: 0, calculatedAt: 0 }),
            '{ this is not json }',
            JSON.stringify({ score: 30, level: 'warming', factors: {}, messageCount: 3, sessionDuration: 0, calculatedAt: 0 }),
        ].join('\n') + '\n');
        const history = storage.getHistory('s7');
        (0, vitest_1.expect)(history).toHaveLength(2);
        (0, vitest_1.expect)(history[0].score).toBe(10);
        (0, vitest_1.expect)(history[1].score).toBe(30);
    });
    // --- clearHistory() ---
    (0, vitest_1.it)('deletes the session file', () => {
        storage.record('s8', makeAnalysis());
        (0, vitest_1.expect)(fs.existsSync(path.join(tmpDir, 's8.jsonl'))).toBe(true);
        storage.clearHistory('s8');
        (0, vitest_1.expect)(fs.existsSync(path.join(tmpDir, 's8.jsonl'))).toBe(false);
    });
    (0, vitest_1.it)('does not throw when clearing a nonexistent session', () => {
        (0, vitest_1.expect)(() => storage.clearHistory('does-not-exist')).not.toThrow();
    });
    (0, vitest_1.it)('getHistory returns [] after clearHistory', () => {
        storage.record('s9', makeAnalysis());
        storage.clearHistory('s9');
        (0, vitest_1.expect)(storage.getHistory('s9')).toEqual([]);
    });
    // --- sessionPath() ---
    (0, vitest_1.it)('returns the expected path for a session key', () => {
        const p = storage.sessionPath('abc-123');
        (0, vitest_1.expect)(p).toBe(path.join(tmpDir, 'abc-123.jsonl'));
    });
});
