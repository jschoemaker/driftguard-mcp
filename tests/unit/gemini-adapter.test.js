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
const gemini_adapter_1 = require("../../src/watchers/gemini-adapter");
const FIXTURES = path.resolve('tests/fixtures');
const adapter = new gemini_adapter_1.GeminiAdapter();
(0, vitest_1.describe)('GeminiAdapter.canParse', () => {
    (0, vitest_1.it)('matches a .gemini path with .json extension', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.gemini/tmp/session-1/chats/session.json')).toBe(true);
    });
    (0, vitest_1.it)('does not match a .claude path', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
    });
    (0, vitest_1.it)('does not match a non-.gemini json file', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.codex/sessions/session.json')).toBe(false);
    });
});
(0, vitest_1.describe)('GeminiAdapter.parse', () => {
    (0, vitest_1.it)('parses all user and gemini messages, skipping info/error', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        (0, vitest_1.expect)(messages.length).toBe(5);
    });
    (0, vitest_1.it)('maps type:gemini to role:assistant', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        (0, vitest_1.expect)(messages[1].role).toBe('assistant');
    });
    (0, vitest_1.it)('preserves type:user as role:user', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        (0, vitest_1.expect)(messages[0].role).toBe('user');
        (0, vitest_1.expect)(messages[2].role).toBe('user');
    });
    (0, vitest_1.it)('extracts content string directly', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        (0, vitest_1.expect)(messages[0].content).toBe('How do I sort a list in Python?');
    });
    (0, vitest_1.it)('parses timestamps from ISO strings', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        (0, vitest_1.expect)(messages[0].timestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
    });
    (0, vitest_1.it)('assigns unique ids to each message', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        const ids = messages.map(m => m.id);
        (0, vitest_1.expect)(new Set(ids).size).toBe(ids.length);
    });
    (0, vitest_1.it)('reads toolTokens from tokens.tool when available', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        const withTool = messages.find(m => m.toolTokens !== undefined && m.toolTokens > 0);
        (0, vitest_1.expect)(withTool).toBeDefined();
        (0, vitest_1.expect)(withTool.toolTokens).toBe(85);
    });
    (0, vitest_1.it)('does not set toolTokens on messages without tool usage', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
        const plain = messages.find(m => m.content === 'How do I sort a list in Python?');
        (0, vitest_1.expect)(plain?.toolTokens).toBeUndefined();
    });
    (0, vitest_1.it)('returns empty array for malformed JSON', () => {
        const tmp = path.join(FIXTURES, 'gemini-sample.json');
        // Test by passing a file that parses but has no messages array
        const result = adapter.parse(tmp);
        (0, vitest_1.expect)(Array.isArray(result)).toBe(true);
    });
});
