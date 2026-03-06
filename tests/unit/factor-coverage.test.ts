/**
 * Factor coverage tests — verifies each of the 7 drift factors actually
 * produces a measurable signal when the relevant pattern is present.
 *
 * Each test isolates one factor using ALL_ZERO_WEIGHTS with only that
 * factor's weight set to 1.0, then asserts the raw factor value > 0
 * (or > a meaningful threshold) when the trigger condition is met.
 */

import { describe, it, expect } from 'vitest';
import { calculateDrift } from '../../src/core/drift-calculator';
import { DriftWeights } from '../../src/core/types';
import { makeMsg, conversation, repeatPair } from '../helpers';

const ZERO: DriftWeights = {
  contextSaturation: 0,
  topicScatter: 0,
  uncertaintySignals: 0,
  repetition: 0,
  goalDistance: 0,
  confidenceDrift: 0,
  responseLengthCollapse: 0,
};

// ── 1. contextSaturation ─────────────────────────────────────────────────────

describe('factor: contextSaturation', () => {
  it('is 0 for a very short conversation', () => {
    const msgs = conversation([
      ['hi', 'hello'],
      ['how are you', 'fine thanks'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.contextSaturation).toBe(0);
  });

  it('rises above 0 for a long conversation with many tokens', () => {
    // 40 long exchanges to push token count well above 1500
    const longResponse = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    const msgs = repeatPair('tell me more about this topic in detail', longResponse, 40);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.contextSaturation).toBeGreaterThan(0);
  });
});

  it('scores higher when messages carry toolTokens (tool-heavy session)', () => {
    const withTools = conversation([
      ['hi', 'hello'],
      ['how are you', 'fine thanks'],
    ]).map(m => ({ ...m, toolTokens: 5000 })); // simulate large tool call volume

    const withoutTools = conversation([
      ['hi', 'hello'],
      ['how are you', 'fine thanks'],
    ]);

    const withScore    = calculateDrift(withTools, ZERO).factors.contextSaturation;
    const withoutScore = calculateDrift(withoutTools, ZERO).factors.contextSaturation;
    expect(withScore).toBeGreaterThan(withoutScore);
  });

// ── 2. topicScatter ───────────────────────────────────────────────────────────

describe('factor: topicScatter', () => {
  it('is lower for a focused single-topic conversation', () => {
    const focused = conversation([
      ['what is a binary tree?', 'A binary tree is a data structure where each node has at most two children.'],
      ['how do you traverse a binary tree?', 'You can traverse in-order, pre-order, or post-order using recursion.'],
      ['what is the height of a binary tree?', 'The height is the longest path from root to a leaf node.'],
      ['how do you balance a binary tree?', 'AVL and red-black trees use rotations to maintain balance.'],
      ['what is a binary search tree?', 'A BST keeps left children smaller and right children larger than the parent.'],
      ['how do you insert into a BST?', 'Compare with the current node and recurse left or right until a null slot is found.'],
    ]);

    const scattered = conversation([
      ['what is photosynthesis?', 'Photosynthesis converts sunlight and CO2 into glucose and oxygen.'],
      ['explain quantum entanglement', 'Entangled particles share state regardless of distance between them.'],
      ['how does TCP/IP work?', 'TCP/IP is a protocol suite for transmitting data over packet-switched networks.'],
      ['what causes inflation?', 'Inflation occurs when money supply grows faster than economic output.'],
      ['describe the water cycle', 'Water evaporates, condenses into clouds, and falls as precipitation.'],
      ['how do vaccines work?', 'Vaccines train the immune system by exposing it to antigens or mRNA instructions.'],
    ]);

    const focusedScore = calculateDrift(focused, ZERO).factors.topicScatter;
    const scatteredScore = calculateDrift(scattered, ZERO).factors.topicScatter;
    expect(scatteredScore).toBeGreaterThan(focusedScore);
  });
});

// ── 3. uncertaintySignals ─────────────────────────────────────────────────────

describe('factor: uncertaintySignals', () => {
  it('is 0 for confident assistant responses', () => {
    const msgs = conversation([
      ['what is 2+2?', 'The answer is 4.'],
      ['what is the capital of France?', 'Paris is the capital of France.'],
      ['what is water made of?', 'Water is H2O — two hydrogen atoms bonded to one oxygen atom.'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.uncertaintySignals).toBe(0);
  });

  it('rises above 0 when assistant uses self-correction language', () => {
    const msgs = conversation([
      ['is this approach correct?', 'Actually, I was wrong earlier. Let me correct that — the answer is different.'],
      ['are you sure?', 'I apologize, I made an error. I need to reconsider what I said before.'],
      ['can you clarify?', 'I should clarify — I previously stated something incorrect. Let me revise my answer.'],
      ['what do you mean?', 'Wait, I think I misunderstood. Actually, I need to correct myself here.'],
      ['please confirm', 'I made a mistake — I need to revise what I told you. The correct answer is different.'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.uncertaintySignals).toBeGreaterThan(0);
  });
});

// ── 4. repetition ─────────────────────────────────────────────────────────────

describe('factor: repetition', () => {
  it('is 0 for a short conversation (below message threshold)', () => {
    const msgs = repeatPair('question', 'The same short answer again and again.', 3);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.repetition).toBe(0);
  });

  it('scores higher for a repetitive session than a varied one', () => {
    const repetitive = repeatPair(
      'tell me about best practices',
      'Always write clean maintainable code following established patterns and principles for software engineering.',
      14,
    );
    const varied = conversation([
      ['what is React?', 'React is a declarative UI library for building component-based user interfaces efficiently.'],
      ['how does Redux work?', 'Redux manages application state via a central store, dispatched actions, and pure reducers.'],
      ['explain async/await', 'Async/await is syntactic sugar over Promises that makes asynchronous code read synchronously.'],
      ['what is TypeScript?', 'TypeScript extends JavaScript with static type annotations compiled away at build time.'],
      ['describe REST APIs', 'REST APIs expose resources at stable URLs using standard HTTP verbs and status codes.'],
      ['what is GraphQL?', 'GraphQL is a query language allowing clients to request exactly the data shape they need.'],
      ['explain Docker', 'Docker packages applications into containers with their dependencies for consistent deployment.'],
    ]);

    const repScore = calculateDrift(repetitive, ZERO).factors.repetition;
    const varScore = calculateDrift(varied, ZERO).factors.repetition;
    expect(repScore).toBeGreaterThan(varScore);
    expect(repScore).toBeGreaterThan(0);
  });
});

// ── 5. goalDistance ───────────────────────────────────────────────────────────

describe('factor: goalDistance', () => {
  it('is 0 for a single-message session (no drift possible yet)', () => {
    const msgs = [makeMsg('user', 'I want to build a REST API in Node.js')];
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.goalDistance).toBe(0);
  });

  it('fires above 0 when the conversation drifts far from the opening goal', () => {
    const drifted = conversation([
      ['I want to build a REST API in Node.js', 'Great — start with Express and define your routes.'],
      ['what is the weather like today?', 'I cannot check live weather, but spring averages around 15°C in Europe.'],
      ['tell me a joke', 'Why did the programmer quit? Because they did not get arrays!'],
      ['what movies are popular now?', 'Several blockbusters are currently in theaters including action and sci-fi releases.'],
      ['how do I cook pasta?', 'Boil salted water, add pasta, cook 8-10 minutes, drain and add sauce.'],
      ['what is the meaning of life?', 'Philosophers debate this endlessly — common answers include purpose, love, or 42.'],
    ]);
    const { factors } = calculateDrift(drifted, ZERO);
    expect(factors.goalDistance).toBeGreaterThan(0);
  });
});

// ── 6. confidenceDrift ────────────────────────────────────────────────────────

describe('factor: confidenceDrift', () => {
  it('is 0 for consistently confident assistant responses', () => {
    const msgs = conversation([
      ['is Node.js fast?', 'Yes, Node.js is fast for I/O-bound tasks due to its event loop.'],
      ['is TypeScript worth it?', 'Absolutely — it catches bugs at compile time and improves code readability.'],
      ['should I use REST or GraphQL?', 'REST is simpler; GraphQL is better when clients need flexible queries.'],
      ['is PostgreSQL good?', 'PostgreSQL is excellent — it is ACID-compliant and supports advanced queries.'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.confidenceDrift).toBe(0);
  });

  it('rises when assistant responses contain increasing hedging language', () => {
    const msgs = conversation([
      ['q1', 'Use Express. That is the standard approach for Node.js servers.'],
      ['q2', 'PostgreSQL is correct here. It handles this well.'],
      ['q3', 'I think this might work, but I am not entirely sure about it.'],
      ['q4', 'Perhaps this could be right, though I am uncertain whether it applies.'],
      ['q5', 'I believe this might be the case, possibly, but I am not confident.'],
      ['q6', 'I think this might work perhaps, though I am not sure, it seems like it could be.'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.confidenceDrift).toBeGreaterThan(0);
  });
});

// ── 7. responseLengthCollapse ─────────────────────────────────────────────────

describe('factor: responseLengthCollapse', () => {
  it('is 0 for a short session (below message threshold)', () => {
    const msgs = conversation([
      ['q', 'Short answer.'],
      ['q', 'Short answer.'],
      ['q', 'Short answer.'],
    ]);
    const { factors } = calculateDrift(msgs, ZERO);
    expect(factors.responseLengthCollapse).toBe(0);
  });

  it('is 0 when response length stays consistent', () => {
    const consistent = conversation(
      Array.from({ length: 8 }, (_, i) => [
        `question ${i}`,
        'This is a detailed response that covers the topic thoroughly and provides useful context for the user to understand.',
      ])
    );
    const { factors } = calculateDrift(consistent, ZERO);
    expect(factors.responseLengthCollapse).toBe(0);
  });

  it('rises when late responses are much shorter than early ones', () => {
    const long = 'This is a thorough and detailed explanation covering all the key points and nuances of the topic at hand with many clear examples and extensive context to help the user understand fully.';
    const short = 'Yes, done. Correct.';
    const collapsing = conversation([
      ['q1', long], ['q2', long], ['q3', long], ['q4', long],
      ['q5', long], ['q6', long], ['q7', long], ['q8', long],
      ['q9', short], ['q10', short], ['q11', short], ['q12', short],
    ]);
    const { factors } = calculateDrift(collapsing, ZERO);
    expect(factors.responseLengthCollapse).toBeGreaterThan(0);
  });
});
