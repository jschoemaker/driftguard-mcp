import { describe, it, expect } from 'vitest';
import { calculateDrift } from '../../src/core/drift-calculator';
import { ChatMessage, DEFAULT_WEIGHTS } from '../../src/core/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Partial<ChatMessage> & { role: 'user' | 'assistant'; content: string },
): ChatMessage {
  return {
    id: 'msg-' + Math.random().toString(36).slice(2),
    timestamp: Date.now(),
    platform: 'claude',
    tabId: 0,
    chatId: 'test',
    ...overrides,
  };
}

function makeConversation(count: number, extras?: Partial<ChatMessage>): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push(makeMsg({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message number ${i} with some content to fill out the turn.`,
      ...extras,
    }));
  }
  return msgs;
}

// ---------------------------------------------------------------------------
// Codex context depth from last_token_usage / model_context_window
// ---------------------------------------------------------------------------

describe('Codex context saturation', () => {
  it('uses inputTokens / contextWindowTokens for context depth, not cumulative totals', () => {
    // 50 % of a 200k window used in last turn → depth ~50
    const msgs = makeConversation(10);
    // Attach Codex token fields to the last assistant message
    msgs[msgs.length - 1] = {
      ...msgs[msgs.length - 1],
      role: 'assistant',
      inputTokens: 100_000,        // last_token_usage.input_tokens
      sessionInputTokens: 900_000, // total_token_usage.input_tokens (far exceeds window)
      contextWindowTokens: 200_000, // model_context_window
    };

    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    // At 50 % window usage the raw score is 50, plus minor bonuses (msg count, readability).
    // It must not be near 100 (which would happen if cumulative totals were used).
    expect(analysis.factors.contextSaturation).toBeLessThan(80);
    expect(analysis.factors.contextSaturation).toBeGreaterThanOrEqual(40);
  });

  it('does not force context depth to 100 when cumulative tokens exceed the window', () => {
    // 10 % of a 128k window used in last turn → depth ~10, even though cumulative is 3x the window
    const msgs = makeConversation(6);
    msgs[msgs.length - 1] = {
      ...msgs[msgs.length - 1],
      role: 'assistant',
      inputTokens: 12_800,         // last_token_usage.input_tokens (10 % of window)
      sessionInputTokens: 400_000, // total_token_usage.input_tokens (>3× window)
      contextWindowTokens: 128_000,
    };

    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    expect(analysis.factors.contextSaturation).toBeLessThan(40);
  });

  it('scales to near 100 when last turn fills the context window', () => {
    const msgs = makeConversation(10);
    msgs[msgs.length - 1] = {
      ...msgs[msgs.length - 1],
      role: 'assistant',
      inputTokens: 195_000,        // 97.5 % of window
      sessionInputTokens: 800_000,
      contextWindowTokens: 200_000,
    };

    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    expect(analysis.factors.contextSaturation).toBeGreaterThan(85);
  });
});

// ---------------------------------------------------------------------------
// Claude / Gemini context-depth behaviour does not regress
// ---------------------------------------------------------------------------

describe('Claude/Gemini context depth (no contextWindowTokens)', () => {
  it('uses inputTokens / 200k ratio when contextWindowTokens is absent', () => {
    // 80k / 200k = 40% depth
    const msgs = makeConversation(10);
    msgs[msgs.length - 1] = {
      ...msgs[msgs.length - 1],
      role: 'assistant',
      inputTokens: 80_000,
    };

    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    // 80k/200k = 40, no message-count bonus (10 msgs), no readability decay
    expect(analysis.factors.contextSaturation).toBe(40);
  });

  it('scores ~50 at 96k tokens (matches current session size)', () => {
    const msgs = makeConversation(10);
    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], role: 'assistant', inputTokens: 96_161 };
    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    // 96161/200000 ≈ 48, rounds to 48
    expect(analysis.factors.contextSaturation).toBe(48);
  });

  it('returns 0 when no tokens and message count is low', () => {
    const msgs = makeConversation(4); // no inputTokens, short conversation
    const analysis = calculateDrift(msgs, DEFAULT_WEIGHTS);
    // word-count estimate for 4 short messages is well below 500 → 0
    expect(analysis.factors.contextSaturation).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Session size helpers (tested via the parsed message shape)
// ---------------------------------------------------------------------------

describe('Session size field propagation', () => {
  it('ParsedMessage shape accepts sessionInputTokens and contextWindowTokens', () => {
    // Importing ParsedMessage from claude-parser to verify the type compiles
    // (this is a compile-time check; if it fails, the test file won't run)
    const msg: import('../../src/watchers/claude-parser').ParsedMessage = {
      id: 'x',
      role: 'assistant',
      content: 'hello',
      timestamp: Date.now(),
      inputTokens: 50_000,
      sessionInputTokens: 900_000,
      contextWindowTokens: 200_000,
    };
    expect(msg.sessionInputTokens).toBe(900_000);
    expect(msg.contextWindowTokens).toBe(200_000);
  });
});
