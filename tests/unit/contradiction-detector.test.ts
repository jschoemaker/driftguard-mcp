import { describe, it, expect } from 'vitest';
import { countContradictions } from '../../src/core/contradiction-detector';
import { makeMsg } from '../helpers';

function assistantMsgs(...contents: string[]) {
  return contents.map((c, i) => makeMsg('assistant', c, i * 2000));
}

describe('countContradictions', () => {
  it('returns 0 for an empty list', () => {
    expect(countContradictions([])).toBe(0);
  });

  it('returns 0 for a single clean message', () => {
    const msgs = assistantMsgs('Use the sorted() function to sort a list.');
    expect(countContradictions(msgs)).toBe(0);
  });

  it('returns 0 for multiple clean, non-contradicting messages', () => {
    const msgs = assistantMsgs(
      'Python lists are mutable ordered collections.',
      'You can append items using list.append(item).',
      'Use list.sort() for in-place sorting.',
    );
    expect(countContradictions(msgs)).toBe(0);
  });

  it('detects "I apologize" self-correction', () => {
    const msgs = assistantMsgs(
      'You should use the append() method.',
      'I apologize, I was referring to the wrong method.',
    );
    expect(countContradictions(msgs)).toBeGreaterThan(0);
  });

  it('detects "I was wrong" self-correction', () => {
    const msgs = assistantMsgs(
      'The answer is 42.',
      'I was wrong — the correct answer is actually 43.',
    );
    expect(countContradictions(msgs)).toBeGreaterThan(0);
  });

  it('detects "I made a mistake" pattern', () => {
    const msgs = assistantMsgs(
      'This approach is correct.',
      'I made a mistake in my previous answer, let me correct that.',
    );
    expect(countContradictions(msgs)).toBeGreaterThan(0);
  });

  it('detects "correction:" prefix', () => {
    const msgs = assistantMsgs(
      'Use list.sort() for descending order.',
      'Correction: you need to pass reverse=True to sort descending.',
    );
    expect(countContradictions(msgs)).toBeGreaterThan(0);
  });

  it('detects negation reversal: "you should" → "you shouldn\'t"', () => {
    const msgs = assistantMsgs(
      'You should use global variables here.',
      "Actually, you shouldn't use global variables. Use parameters instead.",
    );
    expect(countContradictions(msgs)).toBeGreaterThan(0);
  });

  it('counts more contradictions in a heavily self-correcting session', () => {
    const contradicting = assistantMsgs(
      'You should use class A.',
      "Actually, you shouldn't use class A. I apologize for the confusion.",
      'Use method B.',
      'I was wrong — method B is deprecated. Use method C instead.',
      'This approach is correct.',
      'Correction: I made a mistake. Let me redo that.',
    );
    const clean = assistantMsgs(
      'Use class A for this task.',
      'Method B is the best choice here.',
      'This approach is well-established and correct.',
    );
    expect(countContradictions(contradicting)).toBeGreaterThan(countContradictions(clean));
  });
});
