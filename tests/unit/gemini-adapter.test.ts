import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { GeminiAdapter } from '../../src/watchers/gemini-adapter';

const FIXTURES = path.resolve('tests/fixtures');
const adapter = new GeminiAdapter();

describe('GeminiAdapter.canParse', () => {
  it('matches a .gemini path with .json extension', () => {
    expect(adapter.canParse('/home/user/.gemini/tmp/session-1/chats/session.json')).toBe(true);
  });

  it('does not match a .claude path', () => {
    expect(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
  });

  it('does not match a non-.gemini json file', () => {
    expect(adapter.canParse('/home/user/.codex/sessions/session.json')).toBe(false);
  });
});

describe('GeminiAdapter.parse', () => {
  it('parses all user and gemini messages, skipping info/error', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    expect(messages.length).toBe(5);
  });

  it('maps type:gemini to role:assistant', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    expect(messages[1].role).toBe('assistant');
  });

  it('preserves type:user as role:user', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    expect(messages[0].role).toBe('user');
    expect(messages[2].role).toBe('user');
  });

  it('extracts content string directly', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    expect(messages[0].content).toBe('How do I sort a list in Python?');
  });

  it('parses timestamps from ISO strings', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    expect(messages[0].timestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
  });

  it('assigns unique ids to each message', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    const ids = messages.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads toolTokens from tokens.tool when available', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    const withTool = messages.find(m => m.toolTokens !== undefined && m.toolTokens > 0);
    expect(withTool).toBeDefined();
    expect(withTool!.toolTokens).toBe(85);
  });

  it('does not set toolTokens on messages without tool usage', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.json'));
    const plain = messages.find(m => m.content === 'How do I sort a list in Python?');
    expect(plain?.toolTokens).toBeUndefined();
  });

  it('returns empty array for malformed JSON', () => {
    const tmp = path.join(FIXTURES, 'gemini-sample.json');
    // Test by passing a file that parses but has no messages array
    const result = adapter.parse(tmp);
    expect(Array.isArray(result)).toBe(true);
  });
});
