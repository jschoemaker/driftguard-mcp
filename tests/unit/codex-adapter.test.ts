import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CodexAdapter } from '../../src/watchers/codex-adapter';

const FIXTURES = path.resolve('tests/fixtures');
const adapter = new CodexAdapter();

describe('CodexAdapter.canParse', () => {
  it('matches a .codex path with .jsonl extension', () => {
    expect(adapter.canParse('/home/user/.codex/sessions/2024/01/01/rollout-abc.jsonl')).toBe(true);
  });

  it('does not match a .claude path', () => {
    expect(adapter.canParse('/home/user/.claude/projects/proj/session.jsonl')).toBe(false);
  });

  it('does not match a non-jsonl codex file', () => {
    expect(adapter.canParse('/home/user/.codex/sessions/abc123.json')).toBe(false);
  });
});

describe('CodexAdapter.parse', () => {
  it('parses all user and agent messages, skipping ExecCommandEnd and session_meta', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages.length).toBe(5);
  });

  it('maps agent_message to role:assistant and user_message to role:user', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
  });

  it('only produces user and assistant role messages', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages.every(m => m.role === 'user' || m.role === 'assistant')).toBe(true);
  });

  it('extracts message content from payload.message', () => {
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

  it('carries ExecCommandEnd output tokens onto the next agent_message', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    const withTool = messages.find(m => m.toolTokens !== undefined && m.toolTokens > 0);
    expect(withTool).toBeDefined();
    expect(withTool!.role).toBe('assistant');
    expect(withTool!.toolTokens).toBeGreaterThan(0);
  });

  it('does not set toolTokens on messages without preceding ExecCommandEnd', () => {
    const messages = adapter.parse(path.join(FIXTURES, 'codex-sample.jsonl'));
    expect(messages[0].toolTokens).toBeUndefined();
    expect(messages[1].toolTokens).toBeUndefined();
  });

  it('carries tool tokens forward via pending accumulation', () => {
    const tmpFile = path.join(os.tmpdir(), `codex-tool-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, [
      JSON.stringify({ timestamp: '2024-01-01T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'run it' } }),
      JSON.stringify({ timestamp: '2024-01-01T10:00:01Z', type: 'event_msg', payload: { type: 'ExecCommandEnd', aggregated_output: 'x'.repeat(400) } }),
      JSON.stringify({ timestamp: '2024-01-01T10:00:02Z', type: 'event_msg', payload: { type: 'agent_message', message: 'done' } }),
    ].join('\n') + '\n');
    const messages = adapter.parse(tmpFile);
    const agentMsg = messages.find(m => m.role === 'assistant');
    expect(agentMsg?.toolTokens).toBeGreaterThan(0);
    fs.unlinkSync(tmpFile);
  });

  it('returns empty array for file with no valid event_msg entries', () => {
    const tmpFile = path.join(os.tmpdir(), `codex-empty-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, JSON.stringify({ type: 'session_meta', payload: {} }) + '\n');
    const messages = adapter.parse(tmpFile);
    expect(messages.length).toBe(0);
    fs.unlinkSync(tmpFile);
  });

  it('patches trailing token_count data onto the last message (post-turn accounting)', () => {
    // Codex emits token_count AFTER agent_message — the last turn's data would otherwise be lost
    const tmpFile = path.join(os.tmpdir(), `codex-trailing-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, [
      JSON.stringify({ timestamp: '2024-01-01T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'hello' } }),
      JSON.stringify({ timestamp: '2024-01-01T10:00:01Z', type: 'event_msg', payload: { type: 'agent_message', message: 'hi there' } }),
      // token_count AFTER agent_message (trailing) — this is the last event
      JSON.stringify({ timestamp: '2024-01-01T10:00:02Z', type: 'event_msg', payload: {
        type: 'token_count',
        info: {
          last_token_usage:  { input_tokens: 8500 },
          total_token_usage: { input_tokens: 8500 },
          model_context_window: 128000,
        },
      }}),
    ].join('\n') + '\n');

    const messages = adapter.parse(tmpFile);
    const last = messages[messages.length - 1];
    // inputTokens NOT patched from trailing event (post-response data would inflate context depth)
    expect(last.inputTokens).toBeUndefined();
    expect(last.sessionInputTokens).toBe(8500);
    expect(last.contextWindowTokens).toBe(128000);
    fs.unlinkSync(tmpFile);
  });

  it('does not overwrite token data already set on a message by a preceding token_count', () => {
    // If a token_count comes BEFORE the message, the message already has the data.
    // The trailing patch should not overwrite it with a second token_count's data.
    const tmpFile = path.join(os.tmpdir(), `codex-pre-token-${Date.now()}.jsonl`);
    fs.writeFileSync(tmpFile, [
      JSON.stringify({ timestamp: '2024-01-01T10:00:00Z', type: 'event_msg', payload: { type: 'user_message', message: 'hello' } }),
      // token_count BEFORE agent_message
      JSON.stringify({ timestamp: '2024-01-01T10:00:01Z', type: 'event_msg', payload: {
        type: 'token_count',
        info: {
          last_token_usage:  { input_tokens: 5000 },
          total_token_usage: { input_tokens: 5000 },
          model_context_window: 128000,
        },
      }}),
      JSON.stringify({ timestamp: '2024-01-01T10:00:02Z', type: 'event_msg', payload: { type: 'agent_message', message: 'hi' } }),
      // No trailing token_count — pending cleared after agent_message
    ].join('\n') + '\n');

    const messages = adapter.parse(tmpFile);
    const last = messages[messages.length - 1];
    expect(last.inputTokens).toBe(5000);
    expect(last.sessionInputTokens).toBe(5000);
    fs.unlinkSync(tmpFile);
  });
});
