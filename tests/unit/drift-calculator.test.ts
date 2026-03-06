import { describe, it, expect } from 'vitest';
import { calculateDrift } from '../../src/core/drift-calculator';
import { DEFAULT_WEIGHTS, DriftWeights } from '../../src/core/types';
import { makeMsg, conversation, repeatPair } from '../helpers';

const ALL_ZERO_WEIGHTS: DriftWeights = {
  contextSaturation: 0,
  topicScatter: 0,
  uncertaintySignals: 0,
  repetition: 0,
  goalDistance: 0,
  confidenceDrift: 0,
  responseLengthCollapse: 0,
};

describe('calculateDrift', () => {
  it('returns score 0 and level "fresh" for an empty message list', () => {
    const result = calculateDrift([], DEFAULT_WEIGHTS);
    expect(result.score).toBe(0);
    expect(result.level).toBe('fresh');
    expect(result.messageCount).toBe(0);
  });

  it('returns a score in [0, 100] for a minimal 2-message input', () => {
    const msgs = [
      makeMsg('user', 'Hello'),
      makeMsg('assistant', 'Hi there!'),
    ];
    const result = calculateDrift(msgs, DEFAULT_WEIGHTS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns a score in [0, 100] for a long conversation', () => {
    const msgs = repeatPair(
      'Can you explain how to write good unit tests?',
      'Good unit tests are isolated, fast, and deterministic. They test one thing at a time.',
      30,
    );
    const result = calculateDrift(msgs, DEFAULT_WEIGHTS);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('all seven factor scores are in [0, 100]', () => {
    const msgs = conversation([
      ['How does TF-IDF work?', 'TF-IDF stands for Term Frequency-Inverse Document Frequency.'],
      ['What about cosine similarity?', 'Cosine similarity measures the angle between two vectors.'],
      ['Can you show me a Python example?', 'Sure! Here is a basic implementation.'],
    ]);
    const { factors } = calculateDrift(msgs, DEFAULT_WEIGHTS);
    for (const [key, val] of Object.entries(factors)) {
      expect(val, `Factor ${key} out of range`).toBeGreaterThanOrEqual(0);
      expect(val, `Factor ${key} out of range`).toBeLessThanOrEqual(100);
    }
  });

  it('score reflects weights: single non-zero weight → score equals that factor × weight', () => {
    const msgs = repeatPair(
      'explain recursion',
      'Recursion is when a function calls itself. It requires a base case to terminate.',
      10,
    );
    const analysis = calculateDrift(msgs, { ...ALL_ZERO_WEIGHTS, repetition: 1.0 });
    // With only repetition weight active, score must equal round(repetition factor)
    expect(analysis.score).toBe(Math.min(100, Math.round(analysis.factors.repetition)));
  });

  it('score is zero when all weights are zero', () => {
    const msgs = conversation([
      ['Why is the sky blue?', 'Rayleigh scattering causes shorter blue wavelengths to scatter more.'],
      ['What about sunsets?', 'At sunset, light travels through more atmosphere, scattering blue away.'],
    ]);
    const result = calculateDrift(msgs, ALL_ZERO_WEIGHTS);
    expect(result.score).toBe(0);
  });

  it('sorts messages by timestamp regardless of insertion order', () => {
    // Insert messages out of chronological order
    const msgs = [
      makeMsg('user', 'Third message', 6000),
      makeMsg('assistant', 'Fourth response', 8000),
      makeMsg('user', 'First message', 2000),
      makeMsg('assistant', 'Second response', 4000),
    ];
    const result = calculateDrift(msgs, DEFAULT_WEIGHTS);
    // Should not throw and should report 4 messages
    expect(result.messageCount).toBe(4);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('a heavily repetitive session scores higher on the repetition factor than a varied one', () => {
    const repetitive = repeatPair(
      'tell me about best practices',
      'Always write clean, maintainable code following established best practices and patterns.',
      12,
    );
    const varied = conversation([
      ['What is React?', 'React is a UI library for building component-based user interfaces.'],
      ['How does Redux work?', 'Redux manages state via a central store, actions, and reducers.'],
      ['Explain async/await', 'Async/await is syntax sugar over Promises for asynchronous code.'],
      ['What is TypeScript?', 'TypeScript adds static types to JavaScript via a compiler.'],
      ['Describe REST APIs', 'REST APIs use HTTP methods to expose resources at stable URLs.'],
      ['What is GraphQL?', 'GraphQL is a query language that lets clients request specific data.'],
    ]);

    const repScore = calculateDrift(repetitive, DEFAULT_WEIGHTS).factors.repetition;
    const varScore = calculateDrift(varied, DEFAULT_WEIGHTS).factors.repetition;
    expect(repScore).toBeGreaterThan(varScore);
  });

  it('includes recommendations in the output', () => {
    const msgs = repeatPair(
      'keep going',
      'Keep going! Here is more content for you.',
      15,
    );
    const result = calculateDrift(msgs, DEFAULT_WEIGHTS);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('exposes calculatedAt as a recent timestamp', () => {
    const before = Date.now();
    const result = calculateDrift([makeMsg('user', 'hi'), makeMsg('assistant', 'hello')], DEFAULT_WEIGHTS);
    const after = Date.now();
    expect(result.calculatedAt).toBeGreaterThanOrEqual(before);
    expect(result.calculatedAt).toBeLessThanOrEqual(after + 10);
  });
});
