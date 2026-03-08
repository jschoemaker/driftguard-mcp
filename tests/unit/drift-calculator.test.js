"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const drift_calculator_1 = require("../../src/core/drift-calculator");
const types_1 = require("../../src/core/types");
const helpers_1 = require("../helpers");
const ALL_ZERO_WEIGHTS = {
    contextSaturation: 0,
    uncertaintySignals: 0,
    repetition: 0,
    goalDistance: 0,
    confidenceDrift: 0,
    responseLengthCollapse: 0,
};
(0, vitest_1.describe)('calculateDrift', () => {
    (0, vitest_1.it)('returns score 0 and level "fresh" for an empty message list', () => {
        const result = (0, drift_calculator_1.calculateDrift)([], types_1.DEFAULT_WEIGHTS);
        (0, vitest_1.expect)(result.score).toBe(0);
        (0, vitest_1.expect)(result.level).toBe('fresh');
        (0, vitest_1.expect)(result.messageCount).toBe(0);
    });
    (0, vitest_1.it)('returns a score in [0, 100] for a minimal 2-message input', () => {
        const msgs = [
            (0, helpers_1.makeMsg)('user', 'Hello'),
            (0, helpers_1.makeMsg)('assistant', 'Hi there!'),
        ];
        const result = (0, drift_calculator_1.calculateDrift)(msgs, types_1.DEFAULT_WEIGHTS);
        (0, vitest_1.expect)(result.score).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result.score).toBeLessThanOrEqual(100);
    });
    (0, vitest_1.it)('returns a score in [0, 100] for a long conversation', () => {
        const msgs = (0, helpers_1.repeatPair)('Can you explain how to write good unit tests?', 'Good unit tests are isolated, fast, and deterministic. They test one thing at a time.', 30);
        const result = (0, drift_calculator_1.calculateDrift)(msgs, types_1.DEFAULT_WEIGHTS);
        (0, vitest_1.expect)(result.score).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(result.score).toBeLessThanOrEqual(100);
    });
    (0, vitest_1.it)('all seven factor scores are in [0, 100]', () => {
        const msgs = (0, helpers_1.conversation)([
            ['How does TF-IDF work?', 'TF-IDF stands for Term Frequency-Inverse Document Frequency.'],
            ['What about cosine similarity?', 'Cosine similarity measures the angle between two vectors.'],
            ['Can you show me a Python example?', 'Sure! Here is a basic implementation.'],
        ]);
        const { factors } = (0, drift_calculator_1.calculateDrift)(msgs, types_1.DEFAULT_WEIGHTS);
        for (const [key, val] of Object.entries(factors)) {
            (0, vitest_1.expect)(val, `Factor ${key} out of range`).toBeGreaterThanOrEqual(0);
            (0, vitest_1.expect)(val, `Factor ${key} out of range`).toBeLessThanOrEqual(100);
        }
    });
    (0, vitest_1.it)('score reflects weights: single non-zero weight → score equals that factor × weight', () => {
        const msgs = (0, helpers_1.repeatPair)('explain recursion', 'Recursion is when a function calls itself. It requires a base case to terminate.', 10);
        const analysis = (0, drift_calculator_1.calculateDrift)(msgs, { ...ALL_ZERO_WEIGHTS, repetition: 1.0 });
        // With only repetition weight active, score must equal round(repetition factor)
        (0, vitest_1.expect)(analysis.score).toBe(Math.min(100, Math.round(analysis.factors.repetition)));
    });
    (0, vitest_1.it)('score is zero when all weights are zero', () => {
        const msgs = (0, helpers_1.conversation)([
            ['Why is the sky blue?', 'Rayleigh scattering causes shorter blue wavelengths to scatter more.'],
            ['What about sunsets?', 'At sunset, light travels through more atmosphere, scattering blue away.'],
        ]);
        const result = (0, drift_calculator_1.calculateDrift)(msgs, ALL_ZERO_WEIGHTS);
        (0, vitest_1.expect)(result.score).toBe(0);
    });
    (0, vitest_1.it)('sorts messages by timestamp regardless of insertion order', () => {
        // Insert messages out of chronological order
        const msgs = [
            (0, helpers_1.makeMsg)('user', 'Third message', 6000),
            (0, helpers_1.makeMsg)('assistant', 'Fourth response', 8000),
            (0, helpers_1.makeMsg)('user', 'First message', 2000),
            (0, helpers_1.makeMsg)('assistant', 'Second response', 4000),
        ];
        const result = (0, drift_calculator_1.calculateDrift)(msgs, types_1.DEFAULT_WEIGHTS);
        // Should not throw and should report 4 messages
        (0, vitest_1.expect)(result.messageCount).toBe(4);
        (0, vitest_1.expect)(result.score).toBeGreaterThanOrEqual(0);
    });
    (0, vitest_1.it)('a heavily repetitive session scores higher on the repetition factor than a varied one', () => {
        const repetitive = (0, helpers_1.repeatPair)('tell me about best practices', 'Always write clean, maintainable code following established best practices and patterns.', 12);
        const varied = (0, helpers_1.conversation)([
            ['What is React?', 'React is a UI library for building component-based user interfaces.'],
            ['How does Redux work?', 'Redux manages state via a central store, actions, and reducers.'],
            ['Explain async/await', 'Async/await is syntax sugar over Promises for asynchronous code.'],
            ['What is TypeScript?', 'TypeScript adds static types to JavaScript via a compiler.'],
            ['Describe REST APIs', 'REST APIs use HTTP methods to expose resources at stable URLs.'],
            ['What is GraphQL?', 'GraphQL is a query language that lets clients request specific data.'],
        ]);
        const repScore = (0, drift_calculator_1.calculateDrift)(repetitive, types_1.DEFAULT_WEIGHTS).factors.repetition;
        const varScore = (0, drift_calculator_1.calculateDrift)(varied, types_1.DEFAULT_WEIGHTS).factors.repetition;
        (0, vitest_1.expect)(repScore).toBeGreaterThan(varScore);
    });
    (0, vitest_1.it)('includes recommendations in the output', () => {
        const msgs = (0, helpers_1.repeatPair)('keep going', 'Keep going! Here is more content for you.', 15);
        const result = (0, drift_calculator_1.calculateDrift)(msgs, types_1.DEFAULT_WEIGHTS);
        (0, vitest_1.expect)(Array.isArray(result.recommendations)).toBe(true);
        (0, vitest_1.expect)(result.recommendations.length).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('exposes calculatedAt as a recent timestamp', () => {
        const before = Date.now();
        const result = (0, drift_calculator_1.calculateDrift)([(0, helpers_1.makeMsg)('user', 'hi'), (0, helpers_1.makeMsg)('assistant', 'hello')], types_1.DEFAULT_WEIGHTS);
        const after = Date.now();
        (0, vitest_1.expect)(result.calculatedAt).toBeGreaterThanOrEqual(before);
        (0, vitest_1.expect)(result.calculatedAt).toBeLessThanOrEqual(after + 10);
    });
});
