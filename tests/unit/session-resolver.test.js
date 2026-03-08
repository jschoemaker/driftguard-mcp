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
const session_resolver_1 = require("../../src/watchers/session-resolver");
const parser = __importStar(require("../../src/watchers/claude-parser"));
(0, vitest_1.describe)('SessionResolver', () => {
    (0, vitest_1.beforeEach)(() => {
        delete process.env.DRIFTCLI_SESSION_ID;
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        delete process.env.DRIFTCLI_SESSION_ID;
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)('returns null when no session exists and no env var is set', () => {
        vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(null);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        const resolver = new session_resolver_1.SessionResolver();
        (0, vitest_1.expect)(resolver.resolve()).toBeNull();
    });
    (0, vitest_1.it)('delegates to findLatestSession when DRIFTCLI_SESSION_ID is not set', () => {
        const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
        const spy = vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        const resolver = new session_resolver_1.SessionResolver();
        const result = resolver.resolve();
        (0, vitest_1.expect)(result).toBe(mockPath);
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('uses findSessionByUUID when DRIFTCLI_SESSION_ID is set', () => {
        const uuid = 'test-session-uuid-1234';
        const mockPath = `/home/user/.claude/projects/proj/${uuid}.jsonl`;
        process.env.DRIFTCLI_SESSION_ID = uuid;
        vitest_1.vi.spyOn(parser, 'findSessionByUUID').mockReturnValue(mockPath);
        vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue('/other/session.jsonl');
        const resolver = new session_resolver_1.SessionResolver();
        const result = resolver.resolve();
        (0, vitest_1.expect)(result).toBe(mockPath);
    });
    (0, vitest_1.it)('falls back to findLatestSession when env UUID is set but not found', () => {
        const warnSpy = vitest_1.vi.spyOn(console, 'warn').mockImplementation(() => { });
        process.env.DRIFTCLI_SESSION_ID = 'nonexistent-uuid';
        const fallbackPath = '/home/user/.claude/projects/proj/other.jsonl';
        vitest_1.vi.spyOn(parser, 'findSessionByUUID').mockReturnValue(null);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(fallbackPath);
        const resolver = new session_resolver_1.SessionResolver();
        const result = resolver.resolve();
        (0, vitest_1.expect)(result).toBe(fallbackPath);
        (0, vitest_1.expect)(warnSpy).toHaveBeenCalledWith(vitest_1.expect.stringContaining('nonexistent-uuid'));
    });
    (0, vitest_1.it)('returns the cached result on a second call within TTL', () => {
        const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
        const spy = vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        const resolver = new session_resolver_1.SessionResolver(5000);
        resolver.resolve();
        resolver.resolve();
        // findLatestSession should only be called once thanks to caching
        (0, vitest_1.expect)(spy).toHaveBeenCalledOnce();
    });
    (0, vitest_1.it)('re-resolves after invalidate() is called', () => {
        const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
        const spy = vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        const resolver = new session_resolver_1.SessionResolver(5000);
        resolver.resolve();
        resolver.invalidate();
        resolver.resolve();
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(2);
    });
    (0, vitest_1.it)('re-resolves after TTL expires', async () => {
        const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
        const spy = vitest_1.vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
        vitest_1.vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
        const resolver = new session_resolver_1.SessionResolver(10); // 10ms TTL
        resolver.resolve();
        await new Promise(r => setTimeout(r, 20));
        resolver.resolve();
        (0, vitest_1.expect)(spy).toHaveBeenCalledTimes(2);
    });
});
