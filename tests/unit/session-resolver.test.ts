import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionResolver } from '../../src/watchers/session-resolver';
import * as parser from '../../src/watchers/claude-parser';

describe('SessionResolver', () => {
  beforeEach(() => {
    delete process.env.DRIFTCLI_SESSION_ID;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.DRIFTCLI_SESSION_ID;
    vi.restoreAllMocks();
  });

  it('returns null when no session exists and no env var is set', () => {
    vi.spyOn(parser, 'findLatestSession').mockReturnValue(null);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
    const resolver = new SessionResolver();
    expect(resolver.resolve()).toBeNull();
  });

  it('delegates to findLatestSession when DRIFTCLI_SESSION_ID is not set', () => {
    const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
    const spy = vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
    const resolver = new SessionResolver();
    const result = resolver.resolve();
    expect(result).toBe(mockPath);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('uses findSessionByUUID when DRIFTCLI_SESSION_ID is set', () => {
    const uuid = 'test-session-uuid-1234';
    const mockPath = `/home/user/.claude/projects/proj/${uuid}.jsonl`;
    process.env.DRIFTCLI_SESSION_ID = uuid;
    vi.spyOn(parser, 'findSessionByUUID').mockReturnValue(mockPath);
    vi.spyOn(parser, 'findLatestSession').mockReturnValue('/other/session.jsonl');

    const resolver = new SessionResolver();
    const result = resolver.resolve();
    expect(result).toBe(mockPath);
  });

  it('falls back to findLatestSession when env UUID is set but not found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.DRIFTCLI_SESSION_ID = 'nonexistent-uuid';
    const fallbackPath = '/home/user/.claude/projects/proj/other.jsonl';
    vi.spyOn(parser, 'findSessionByUUID').mockReturnValue(null);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);
    vi.spyOn(parser, 'findLatestSession').mockReturnValue(fallbackPath);

    const resolver = new SessionResolver();
    const result = resolver.resolve();
    expect(result).toBe(fallbackPath);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent-uuid'));
  });

  it('returns the cached result on a second call within TTL', () => {
    const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
    const spy = vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);

    const resolver = new SessionResolver(5000);
    resolver.resolve();
    resolver.resolve();

    // findLatestSession should only be called once thanks to caching
    expect(spy).toHaveBeenCalledOnce();
  });

  it('re-resolves after invalidate() is called', () => {
    const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
    const spy = vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);

    const resolver = new SessionResolver(5000);
    resolver.resolve();
    resolver.invalidate();
    resolver.resolve();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('re-resolves after TTL expires', async () => {
    const mockPath = '/home/user/.claude/projects/proj/session.jsonl';
    const spy = vi.spyOn(parser, 'findLatestSession').mockReturnValue(mockPath);
    vi.spyOn(parser, 'findSessionByCwd').mockReturnValue(null);

    const resolver = new SessionResolver(10); // 10ms TTL
    resolver.resolve();
    await new Promise(r => setTimeout(r, 20));
    resolver.resolve();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
