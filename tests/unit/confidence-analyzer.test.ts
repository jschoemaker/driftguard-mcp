import { describe, it, expect } from 'vitest';
import {
  detectHedgingLanguage,
  trackConfidenceTrend,
  calculateConfidenceDrift,
} from '../../src/core/confidence-analyzer';
import { makeMsg, conversation } from '../helpers';

describe('detectHedgingLanguage', () => {
  it('returns 0 for an empty string', () => {
    expect(detectHedgingLanguage('')).toBe(0);
  });

  it('returns 0 for a string shorter than 10 characters', () => {
    expect(detectHedgingLanguage('ok.')).toBe(0);
  });

  it('returns 0 for confident, direct text', () => {
    const confident = 'The answer is 42. Use the sort() function to sort the list.';
    expect(detectHedgingLanguage(confident)).toBe(0);
  });

  it('returns a positive score for hedging-heavy text', () => {
    const hedged = 'I think this might be correct, but perhaps you should probably check. It seems likely it could work.';
    expect(detectHedgingLanguage(hedged)).toBeGreaterThan(0);
  });

  it('returns a higher score for more hedging', () => {
    const light = 'This might work.';
    const heavy = 'I think this might possibly work, but perhaps it could be that maybe it seems somewhat wrong.';
    expect(detectHedgingLanguage(heavy)).toBeGreaterThan(detectHedgingLanguage(light));
  });

  it('returns a value in [0, 100]', () => {
    const text = 'maybe perhaps possibly arguably probably I think I believe it seems might could';
    const score = detectHedgingLanguage(text);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('trackConfidenceTrend', () => {
  it('returns 0 for fewer than 2 messages', () => {
    expect(trackConfidenceTrend([makeMsg('assistant', 'hello')])).toBe(0);
    expect(trackConfidenceTrend([])).toBe(0);
  });

  it('returns 0 when there are no assistant messages', () => {
    const msgs = [makeMsg('user', 'hello'), makeMsg('user', 'world')];
    expect(trackConfidenceTrend(msgs)).toBe(0);
  });

  it('returns a higher score when later messages are more hedged than earlier ones', () => {
    const confident = 'The answer is clear. Use this approach.';
    const hedged = 'I think this might possibly work, but perhaps it could be somewhat uncertain.';

    const decliningConfidence = [
      makeMsg('assistant', confident, 0),
      makeMsg('assistant', confident, 2000),
      makeMsg('assistant', confident, 4000),
      makeMsg('assistant', hedged, 6000),
      makeMsg('assistant', hedged, 8000),
      makeMsg('assistant', hedged, 10000),
    ];

    const stableConfidence = [
      makeMsg('assistant', confident, 0),
      makeMsg('assistant', confident, 2000),
      makeMsg('assistant', confident, 4000),
      makeMsg('assistant', confident, 6000),
      makeMsg('assistant', confident, 8000),
      makeMsg('assistant', confident, 10000),
    ];

    expect(trackConfidenceTrend(decliningConfidence)).toBeGreaterThan(
      trackConfidenceTrend(stableConfidence),
    );
  });
});

describe('calculateConfidenceDrift', () => {
  it('returns 0 for fewer than 2 messages', () => {
    expect(calculateConfidenceDrift([])).toBe(0);
    expect(calculateConfidenceDrift([makeMsg('user', 'hello')])).toBe(0);
  });

  it('returns a value in [0, 100]', () => {
    const msgs = conversation([
      ['Help me', 'I think this might possibly work, but I am not entirely sure.'],
      ['More help', 'Perhaps you could maybe try this approach, though I am uncertain.'],
      ['Continue', 'I believe this could be right, but I am not fully confident.'],
    ]);
    const score = calculateConfidenceDrift(msgs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns a higher score for sessions with heavy hedging versus clean sessions', () => {
    const hedgySession = conversation([
      ['?', 'I think this might possibly work, but perhaps it could be wrong.'],
      ['?', 'Maybe, it seems like it could perhaps be the case, I am not sure.'],
      ['?', 'I believe this might be right but I am uncertain, possibly wrong.'],
      ['?', 'Perhaps this could maybe work, though I am not entirely confident.'],
    ]);

    const cleanSession = conversation([
      ['?', 'Use the sort() function. It sorts in ascending order by default.'],
      ['?', 'Set reverse=True for descending order. This is well-documented.'],
      ['?', 'The key parameter accepts any callable. Use lambda x: x["age"].'],
      ['?', 'Stable sort is guaranteed in Python. The algorithm is Timsort.'],
    ]);

    expect(calculateConfidenceDrift(hedgySession)).toBeGreaterThan(
      calculateConfidenceDrift(cleanSession),
    );
  });
});
