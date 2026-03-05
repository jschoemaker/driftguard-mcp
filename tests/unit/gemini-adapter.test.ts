import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { GeminiAdapter } from '../../src/watchers/gemini-adapter';

const FIXTURES = path.resolve('tests/fixtures');
const adapter = new GeminiAdapter();

describe('GeminiAdapter.canParse', () => {
  it('matches a .gemini path with .jsonl extension', () => {
    expect(adapter.canParse('/home/user/.gemini/tmp/session-1/conversation.jsonl')).toBe(true);
  });

  it('does not match a .claude path', () => {
    expect(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
  });

  it('does not match a non-jsonl gemini file', () => {
    expect(adapter.canParse('/home/user/.gemini/tmp/session-1/conversation.json')).toBe(false);
  });
});

describe('GeminiAdapter.parse', () => {
  it('parses all messages from the sample fixture', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    expect(messages.length).toBe(3);
  });

  it('maps role:model to role:assistant', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    expect(messages[1].role).toBe('assistant');
  });

  it('preserves role:user as-is', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    expect(messages[0].role).toBe('user');
    expect(messages[2].role).toBe('user');
  });

  it('extracts text from parts array', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    expect(messages[0].content).toBe('How do I sort a list in Python?');
  });

  it('parses timestamps from ISO strings', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    expect(messages[0].timestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
  });

  it('assigns unique ids to each message', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'gemini-sample.jsonl'));
    const ids = messages.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
