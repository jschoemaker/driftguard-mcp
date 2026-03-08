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
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const codex_adapter_1 = require("../../src/watchers/codex-adapter");
const FIXTURES = path.resolve('tests/fixtures');
const adapter = new codex_adapter_1.CodexAdapter();
(0, vitest_1.describe)('CodexAdapter.canParse', () => {
    (0, vitest_1.it)('matches a .codex path with .jsonl extension', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.codex/sessions/2024/01/01/rollout-abc.jsonl')).toBe(true);
    });
    (0, vitest_1.it)('does not match a .claude path', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
    });
    (0, vitest_1.it)('does not match a non-jsonl codex file', () => {
        (0, vitest_1.expect)(adapter.canParse('/home/user/.codex/sessions/abc123.json')).toBe(false);
    });
});
(0, vitest_1.describe)('CodexAdapter.parse', () => {
    (0, vitest_1.it)('parses all user and agent messages, skipping ExecCommandEnd and session_meta', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages.length).toBe(5);
    });
    (0, vitest_1.it)('maps agent_message to role:assistant and user_message to role:user', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages[0].role).toBe('user');
        (0, vitest_1.expect)(messages[1].role).toBe('assistant');
        (0, vitest_1.expect)(messages[2].role).toBe('user');
    });
    (0, vitest_1.it)('only produces user and assistant role messages', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
    });
    (0, vitest_1.it)('extracts message content from payload.message', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages[0].content).toBe('How do I reverse a string in JavaScript?');
    });
    (0, vitest_1.it)('parses timestamps from ISO strings', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages[0].timestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
    });
    (0, vitest_1.it)('assigns unique ids to each message', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        const ids = messages.map(m => m.id);
        (0, vitest_1.expect)(new Set(ids).size).toBe(ids.length);
    });
    (0, vitest_1.it)('carries ExecCommandEnd output tokens onto the next agent_message', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        const withTool = messages.find(m => m.toolTokens !== undefined && m.toolTokens > 0);
        (0, vitest_1.expect)(withTool).toBeDefined();
        (0, vitest_1.expect)(withTool.role).toBe('assistant');
        (0, vitest_1.expect)(withTool.toolTokens).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('does not set toolTokens on messages without preceding ExecCommandEnd', () => {
        const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
        (0, vitest_1.expect)(messages[0].toolTokens).toBeUndefined();
        (0, vitest_1.expect)(messages[1].toolTokens).toBeUndefined();
    });
    (0, vitest_1.it)('carries tool tokens forward via pending accumulation', () => {
        const tmpFile = path.join(os.tmpdir(), `codex-tool-${Date.now()}.jsonl`);
        fs.writeFileSync(tmpFile, [
            JSON.stringify({ timestamp: '2024-01-01T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'run it' } }),
            JSON.stringify({ timestamp: '2024-01-01T10:00:01Z', type: 'event_msg', payload: { type: 'ExecCommandEnd', aggregated_output: 'x'.repeat(400) } }),
            JSON.stringify({ timestamp: '2024-01-01T10:00:02Z', type: 'event_msg', payload: { type: 'agent_message', message: 'done' } }),
        ].join('\n') + '\n');
        const messages = adapter.parse(tmpFile);
        const agentMsg = messages.find(m => m.role === 'assistant');
        (0, vitest_1.expect)(agentMsg?.toolTokens).toBeGreaterThan(0);
        fs.unlinkSync(tmpFile);
    });
    (0, vitest_1.it)('returns empty array for file with no valid event_msg entries', () => {
        const tmpFile = path.join(os.tmpdir(), `codex-empty-${Date.now()}.jsonl`);
        fs.writeFileSync(tmpFile, JSON.stringify({ type: 'session_meta', payload: {} }) + '\n');
        const messages = adapter.parse(tmpFile);
        (0, vitest_1.expect)(messages.length).toBe(0);
        fs.unlinkSync(tmpFile);
    });
});
