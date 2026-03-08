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
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const claude_parser_1 = require("../../src/watchers/claude-parser");
const FIXTURES = path.resolve('tests/fixtures');
(0, vitest_1.describe)('parseJSONL', () => {
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)('parses user messages with string content', () => {
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'simple.jsonl'));
        const userMsgs = messages.filter(m => m.role === 'user');
        (0, vitest_1.expect)(userMsgs.length).toBe(4);
        (0, vitest_1.expect)(userMsgs[0].content).toBe('How do I sort a list in Python?');
    });
    (0, vitest_1.it)('parses assistant messages with array content blocks', () => {
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'simple.jsonl'));
        const assistantMsgs = messages.filter(m => m.role === 'assistant');
        (0, vitest_1.expect)(assistantMsgs.length).toBe(4);
        (0, vitest_1.expect)(assistantMsgs[0].content).toContain('sort()');
    });
    (0, vitest_1.it)('returns all messages in the correct order (user, assistant alternating)', () => {
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'simple.jsonl'));
        (0, vitest_1.expect)(messages.length).toBe(8);
        (0, vitest_1.expect)(messages[0].role).toBe('user');
        (0, vitest_1.expect)(messages[1].role).toBe('assistant');
    });
    (0, vitest_1.it)('skips malformed JSON lines and emits a warning', () => {
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'malformed.jsonl'));
        // 3 parseable messages (2 user + 1 assistant); the summary-type line is silently ignored
        (0, vitest_1.expect)(messages.length).toBe(3);
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('malformed'));
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('malformed.jsonl'));
    });
    (0, vitest_1.it)('filters out whitespace-only message content', () => {
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'whitespace-content.jsonl'));
        // Only the third message ("This is a real message") should survive
        (0, vitest_1.expect)(messages.length).toBe(1);
        (0, vitest_1.expect)(messages[0].content).toBe('This is a real message');
        warnSpy.mockRestore();
    });
    (0, vitest_1.it)('returns valid finite timestamps for all messages', () => {
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'simple.jsonl'));
        for (const m of messages) {
            (0, vitest_1.expect)(Number.isFinite(m.timestamp)).toBe(true);
            (0, vitest_1.expect)(m.timestamp).toBeGreaterThan(0);
        }
    });
    (0, vitest_1.it)('falls back to Date.now() for an invalid timestamp without throwing', () => {
        // Inline JSONL string via temp file
        const tmpPath = path.join(os.tmpdir(), `driftcli-ts-${Date.now()}.jsonl`);
        const fs = require('fs');
        fs.writeFileSync(tmpPath, JSON.stringify({
            type: 'user',
            uuid: 'x1',
            timestamp: 'not-a-date',
            message: { role: 'user', content: 'hello' },
        }));
        const before = Date.now();
        const messages = (0, claude_parser_1.parseJSONL)(tmpPath);
        const after = Date.now();
        fs.unlinkSync(tmpPath);
        (0, vitest_1.expect)(messages.length).toBe(1);
        (0, vitest_1.expect)(messages[0].timestamp).toBeGreaterThanOrEqual(before);
        (0, vitest_1.expect)(messages[0].timestamp).toBeLessThanOrEqual(after + 10);
    });
    (0, vitest_1.it)('skips entries that are not type user or assistant', () => {
        const messages = (0, claude_parser_1.parseJSONL)(path.join(FIXTURES, 'malformed.jsonl'));
        // The {"type":"summary",...} line should not appear in messages
        (0, vitest_1.expect)(messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
    });
    (0, vitest_1.it)('resets messages at compact_boundary — only post-compaction messages are returned', () => {
        const fs = require('fs');
        const tmpPath = path.join(os.tmpdir(), `driftcli-compact-${Date.now()}.jsonl`);
        const lines = [
            JSON.stringify({ type: 'user', uuid: 'u1', timestamp: 1000, message: { role: 'user', content: 'pre-compaction message' } }),
            JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: 2000, message: { role: 'assistant', content: [{ type: 'text', text: 'pre-compaction reply' }] } }),
            JSON.stringify({ type: 'system', subtype: 'compact_boundary', uuid: 'cb1', timestamp: 3000, content: 'Conversation compacted' }),
            JSON.stringify({ type: 'user', uuid: 'u2', timestamp: 4000, message: { role: 'user', content: 'post-compaction message' } }),
            JSON.stringify({ type: 'assistant', uuid: 'a2', timestamp: 5000, message: { role: 'assistant', content: [{ type: 'text', text: 'post-compaction reply' }] } }),
        ];
        fs.writeFileSync(tmpPath, lines.join('\n'));
        const messages = (0, claude_parser_1.parseJSONL)(tmpPath);
        fs.unlinkSync(tmpPath);
        (0, vitest_1.expect)(messages.length).toBe(2);
        (0, vitest_1.expect)(messages[0].content).toBe('post-compaction message');
        (0, vitest_1.expect)(messages[1].content).toBe('post-compaction reply');
    });
    (0, vitest_1.it)('filters out tool noise messages like "Tool loaded."', () => {
        const fs = require('fs');
        const tmpPath = path.join(os.tmpdir(), `driftcli-noise-${Date.now()}.jsonl`);
        const lines = [
            JSON.stringify({ type: 'user', uuid: 'u1', timestamp: 1000, message: { role: 'user', content: 'Tool loaded.' } }),
            JSON.stringify({ type: 'user', uuid: 'u2', timestamp: 2000, message: { role: 'user', content: 'Real user message' } }),
            JSON.stringify({ type: 'assistant', uuid: 'a1', timestamp: 3000, message: { role: 'assistant', content: [{ type: 'text', text: 'Real reply' }] } }),
        ];
        fs.writeFileSync(tmpPath, lines.join('\n'));
        const messages = (0, claude_parser_1.parseJSONL)(tmpPath);
        fs.unlinkSync(tmpPath);
        (0, vitest_1.expect)(messages.length).toBe(2);
        (0, vitest_1.expect)(messages.every(m => m.content !== 'Tool loaded.')).toBe(true);
    });
});
(0, vitest_1.describe)('findLatestSession', () => {
    (0, vitest_1.afterEach)(() => {
        delete process.env.DRIFTCLI_HOME;
    });
    (0, vitest_1.it)('returns null when the .claude/projects directory does not exist', () => {
        process.env.DRIFTCLI_HOME = path.join(os.tmpdir(), `no-such-dir-${Date.now()}`);
        const result = (0, claude_parser_1.findLatestSession)();
        (0, vitest_1.expect)(result).toBeNull();
    });
});
(0, vitest_1.describe)('cwdToProjectSlug', () => {
    (0, vitest_1.it)('converts a Windows path to a slug', () => {
        (0, vitest_1.expect)((0, claude_parser_1.cwdToProjectSlug)('C:\\Users\\user\\Desktop\\myproject')).toBe('C--Users-user-Desktop-myproject');
    });
    (0, vitest_1.it)('converts a Unix path to a slug', () => {
        (0, vitest_1.expect)((0, claude_parser_1.cwdToProjectSlug)('/home/user/projects/myproject')).toBe('home-user-projects-myproject');
    });
    (0, vitest_1.it)('strips leading and trailing dashes', () => {
        // A path starting with / produces a leading dash after replace; it should be stripped
        (0, vitest_1.expect)((0, claude_parser_1.cwdToProjectSlug)('/root')).toBe('root');
    });
    (0, vitest_1.it)('replaces each separator character with its own dash', () => {
        // C:\ has colon + backslash → two dashes → C--foo
        (0, vitest_1.expect)((0, claude_parser_1.cwdToProjectSlug)('C:\\foo')).toBe('C--foo');
    });
});
(0, vitest_1.describe)('findSessionByCwd', () => {
    const fs = require('fs');
    (0, vitest_1.afterEach)(() => {
        delete process.env.DRIFTCLI_HOME;
    });
    (0, vitest_1.it)('returns null when the slug directory does not exist', () => {
        process.env.DRIFTCLI_HOME = path.join(os.tmpdir(), `no-home-${Date.now()}`);
        const result = (0, claude_parser_1.findSessionByCwd)('/nonexistent/project/path');
        (0, vitest_1.expect)(result).toBeNull();
    });
    (0, vitest_1.it)('returns null when the project directory has no jsonl files', () => {
        const home = path.join(os.tmpdir(), `driftcli-cwd-${Date.now()}`);
        const slug = 'test-project';
        const projectDir = path.join(home, '.claude', 'projects', slug);
        fs.mkdirSync(projectDir, { recursive: true });
        process.env.DRIFTCLI_HOME = home;
        const result = (0, claude_parser_1.findSessionByCwd)('/test/project');
        (0, vitest_1.expect)(result).toBeNull();
        fs.rmSync(home, { recursive: true });
    });
    (0, vitest_1.it)('returns the most recently modified jsonl in the matching project directory', () => {
        const home = path.join(os.tmpdir(), `driftcli-cwd-${Date.now()}`);
        const slug = (0, claude_parser_1.cwdToProjectSlug)('/test/project');
        const projectDir = path.join(home, '.claude', 'projects', slug);
        fs.mkdirSync(projectDir, { recursive: true });
        process.env.DRIFTCLI_HOME = home;
        const older = path.join(projectDir, 'older.jsonl');
        const newer = path.join(projectDir, 'newer.jsonl');
        fs.writeFileSync(older, '');
        // Small delay to ensure different mtime
        fs.writeFileSync(newer, '');
        // Touch newer to ensure it has a later mtime
        const now = new Date();
        fs.utimesSync(older, now, new Date(now.getTime() - 1000));
        fs.utimesSync(newer, now, now);
        const result = (0, claude_parser_1.findSessionByCwd)('/test/project');
        (0, vitest_1.expect)(result).toBe(newer);
        fs.rmSync(home, { recursive: true });
    });
});
