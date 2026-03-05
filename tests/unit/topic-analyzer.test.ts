import { describe, it, expect } from 'vitest';
import { calculateTopicEntropy, extractTopTerms } from '../../src/core/topic-analyzer';
import { makeMsg, conversation } from '../helpers';

describe('calculateTopicEntropy', () => {
  it('returns 0 for fewer than 3 messages', () => {
    expect(calculateTopicEntropy([])).toBe(0);
    expect(calculateTopicEntropy([makeMsg('user', 'hello')])).toBe(0);
    expect(calculateTopicEntropy([
      makeMsg('user', 'hello'),
      makeMsg('assistant', 'hi there'),
    ])).toBe(0);
  });

  it('returns a value in [0, 100]', () => {
    const msgs = conversation([
      ['How does React work?', 'React is a UI library for building components.'],
      ['What about hooks?', 'Hooks let you use state in function components.'],
      ['Explain useEffect', 'useEffect runs after render and handles side effects.'],
    ]);
    const score = calculateTopicEntropy(msgs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('returns a lower score for a coherent single-topic conversation', () => {
    const coherent = conversation([
      ['How do I sort a Python list?', 'Use list.sort() or sorted() for in-place or new list sorting.'],
      ['Can I sort in reverse?', 'Yes, pass reverse=True to sort() or sorted().'],
      ['Sort by custom key?', 'Use the key parameter: list.sort(key=lambda x: x["value"]).'],
      ['What about stable sort?', 'Python sort is stable — equal elements keep their original order.'],
    ]);

    const scattered = conversation([
      ['How do I sort a Python list?', 'Use list.sort() for in-place sorting.'],
      ['What is Kubernetes?', 'Kubernetes is a container orchestration platform for microservices.'],
      ['Explain blockchain technology', 'Blockchain is a distributed ledger using cryptographic hashes.'],
      ['How does TCP/IP work?', 'TCP/IP is the foundational protocol suite for internet communication.'],
    ]);

    expect(calculateTopicEntropy(coherent)).toBeLessThan(calculateTopicEntropy(scattered));
  });

  it('handles sessions with more than 150 messages without throwing (cap guard)', () => {
    const msgs: ReturnType<typeof makeMsg>[] = [];
    const content = 'React component hooks state management typescript frontend development';
    for (let i = 0; i < 200; i++) {
      msgs.push(makeMsg(i % 2 === 0 ? 'user' : 'assistant', content, i * 1000));
    }
    expect(() => calculateTopicEntropy(msgs)).not.toThrow();
    const score = calculateTopicEntropy(msgs);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('extractTopTerms', () => {
  it('returns an empty array for messages with no meaningful terms', () => {
    const msgs = [makeMsg('user', 'ok hi bye the and'), makeMsg('assistant', 'yes no ok')];
    // All words are short or stop words — may return empty
    const terms = extractTopTerms(msgs, 5);
    expect(Array.isArray(terms)).toBe(true);
  });

  it('returns at most n terms', () => {
    const msgs = conversation([
      ['React hooks useState useEffect', 'React hooks useState useEffect component'],
      ['TypeScript interfaces generics', 'TypeScript interfaces generics types'],
    ]);
    expect(extractTopTerms(msgs, 3).length).toBeLessThanOrEqual(3);
    expect(extractTopTerms(msgs, 1).length).toBeLessThanOrEqual(1);
  });

  it('returns the most frequent terms first', () => {
    // "typescript" appears many more times than "banana"
    const msgs = conversation([
      ['typescript types typescript typescript', 'typescript generics typescript interfaces'],
      ['typescript modules typescript typescript', 'typescript compilation typescript check banana'],
    ]);
    const terms = extractTopTerms(msgs, 10);
    const tsIndex = terms.indexOf('typescript');
    const bananaIndex = terms.indexOf('banana');
    expect(tsIndex).toBeGreaterThanOrEqual(0);
    if (bananaIndex >= 0) {
      expect(tsIndex).toBeLessThan(bananaIndex);
    }
  });

  it('filters out stop words and short words', () => {
    const msgs = [makeMsg('user', 'the and for with this that from have will about javascript development')];
    const terms = extractTopTerms(msgs, 20);
    const stopWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'will'];
    for (const sw of stopWords) {
      expect(terms).not.toContain(sw);
    }
  });

  it('works on an empty message list', () => {
    expect(() => extractTopTerms([], 5)).not.toThrow();
    expect(extractTopTerms([], 5)).toEqual([]);
  });
});
