import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { parseJSONL, findLatestSession, cwdToProjectSlug, findSessionByCwd } from '../../src/watchers/claude-parser';

const FIXTURES = path.resolve('tests/fixtures');

describe('parseJSONL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses user messages with string content', () => {
    const messages = parseJSONL(path.join(FIXTURES, 'simple.jsonl'));
    const userMsgs = messages.filter(m => m.role === 'user');
    expect(userMsgs.length).toBe(4);
    expect(userMsgs[0].content).toBe('How do I sort a list in Python?');
  });

  it('parses assistant messages with array content blocks', () => {
    const messages = parseJSONL(path.join(FIXTURES, 'simple.jsonl'));
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    expect(assistantMsgs.length).toBe(4);
    expect(assistantMsgs[0].content).toContain('sort()');
  });

  it('returns all messages in the correct order (user, assistant alternating)', () => {
    const messages = parseJSONL(path.join(FIXTURES, 'simple.jsonl'));
    expect(messages.length).toBe(8);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
  });

  it('skips malformed JSON lines and emits a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const messages = parseJSONL(path.join(FIXTURES, 'malformed.jsonl'));
    // 3 parseable messages (2 user + 1 assistant); the summary-type line is silently ignored
    expect(messages.length).toBe(3);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed.jsonl'));
  });

  it('filters out whitespace-only message content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const messages = parseJSONL(path.join(FIXTURES, 'whitespace-content.jsonl'));
    // Only the third message ("This is a real message") should survive
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('This is a real message');
    warnSpy.mockRestore();
  });

  it('returns valid finite timestamps for all messages', () => {
    const messages = parseJSONL(path.join(FIXTURES, 'simple.jsonl'));
    for (const m of messages) {
      expect(Number.isFinite(m.timestamp)).toBe(true);
      expect(m.timestamp).toBeGreaterThan(0);
    }
  });

  it('falls back to Date.now() for an invalid timestamp without throwing', () => {
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
    const messages = parseJSONL(tmpPath);
    const after = Date.now();
    fs.unlinkSync(tmpPath);

    expect(messages.length).toBe(1);
    expect(messages[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(messages[0].timestamp).toBeLessThanOrEqual(after + 10);
  });

  it('skips entries that are not type user or assistant', () => {
    const messages = parseJSONL(path.join(FIXTURES, 'malformed.jsonl'));
    // The {"type":"summary",...} line should not appear in messages
    expect(messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });
});

describe('findLatestSession', () => {
  afterEach(() => {
    delete process.env.DRIFTCLI_HOME;
  });

  it('returns null when the .claude/projects directory does not exist', () => {
    process.env.DRIFTCLI_HOME = path.join(os.tmpdir(), `no-such-dir-${Date.now()}`);
    const result = findLatestSession();
    expect(result).toBeNull();
  });
});

describe('cwdToProjectSlug', () => {
  it('converts a Windows path to a slug', () => {
    expect(cwdToProjectSlug('C:\\Users\\user\\Desktop\\myproject')).toBe('C--Users-user-Desktop-myproject');
  });

  it('converts a Unix path to a slug', () => {
    expect(cwdToProjectSlug('/home/user/projects/myproject')).toBe('home-user-projects-myproject');
  });

  it('strips leading and trailing dashes', () => {
    // A path starting with / produces a leading dash after replace; it should be stripped
    expect(cwdToProjectSlug('/root')).toBe('root');
  });

  it('replaces each separator character with its own dash', () => {
    // C:\ has colon + backslash → two dashes → C--foo
    expect(cwdToProjectSlug('C:\\foo')).toBe('C--foo');
  });
});

describe('findSessionByCwd', () => {
  const fs = require('fs');

  afterEach(() => {
    delete process.env.DRIFTCLI_HOME;
  });

  it('returns null when the slug directory does not exist', () => {
    process.env.DRIFTCLI_HOME = path.join(os.tmpdir(), `no-home-${Date.now()}`);
    const result = findSessionByCwd('/nonexistent/project/path');
    expect(result).toBeNull();
  });

  it('returns null when the project directory has no jsonl files', () => {
    const home = path.join(os.tmpdir(), `driftcli-cwd-${Date.now()}`);
    const slug = 'test-project';
    const projectDir = path.join(home, '.claude', 'projects', slug);
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.DRIFTCLI_HOME = home;

    const result = findSessionByCwd('/test/project');
    expect(result).toBeNull();

    fs.rmSync(home, { recursive: true });
  });

  it('returns the most recently modified jsonl in the matching project directory', () => {
    const home = path.join(os.tmpdir(), `driftcli-cwd-${Date.now()}`);
    const slug = cwdToProjectSlug('/test/project');
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

    const result = findSessionByCwd('/test/project');
    expect(result).toBe(newer);

    fs.rmSync(home, { recursive: true });
  });
});
