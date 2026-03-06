import { describe, it, expect } from 'vitest';
import { calculateTopicEntropy } from '../../src/core/topic-analyzer';
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

