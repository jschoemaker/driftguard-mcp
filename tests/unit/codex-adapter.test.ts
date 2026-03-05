import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { CodexAdapter } from '../../src/watchers/codex-adapter';

const FIXTURES = path.resolve('tests/fixtures');
const adapter = new CodexAdapter();

describe('CodexAdapter.canParse', () => {
  it('matches a .codex path with .jsonl extension', () => {
    expect(adapter.canParse('/home/user/.codex/sessions/abc123.jsonl')).toBe(true);
  });

  it('does not match a .claude path', () => {
    expect(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
  });

  it('does not match a non-jsonl codex file', () => {
    expect(adapter.canParse('/home/user/.codex/sessions/abc123.json')).toBe(false);
  });
});

describe('CodexAdapter.parse', () => {
  it('parses all messages from the sample fixture', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages.length).toBe(3);
  });

  it('preserves user and assistant roles', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
  });

  it('extracts string content directly', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages[0].content).toBe('How do I reverse a string in JavaScript?');
  });

  it('parses timestamps from ISO strings', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages[0].timestamp).toBe(new Date('2024-01-01T10:00:00Z').getTime());
  });

  it('assigns unique ids to each message', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    const ids = messages.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('handles array content format', () => {
    const fs = require('fs');
    const os = require('os');
    const tmpFile = path.join(os.tmpdir(), `codex-test-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, JSON.stringify({
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello from array content' }],
    }) + '\n');
    const messages = adapter.parse(tmpFile);
    expect(messages[0].content).toBe('Hello from array content');
    fs.unlinkSync(tmpFile);
  });
});
