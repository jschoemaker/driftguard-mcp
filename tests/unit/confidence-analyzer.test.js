"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const confidence_analyzer_1 = require("../../src/core/confidence-analyzer");
const helpers_1 = require("../helpers");
(0, vitest_1.describe)('detectHedgingLanguage', () => {
    (0, vitest_1.it)('returns 0 for an empty string', () => {
        (0, vitest_1.expect)((0, confidence_analyzer_1.detectHedgingLanguage)('')).toBe(0);
    });
    (0, vitest_1.it)('returns 0 for a string shorter than 10 characters', () => {
        (0, vitest_1.expect)((0, confidence_analyzer_1.detectHedgingLanguage)('ok.')).toBe(0);
    });
    (0, vitest_1.it)('returns 0 for confident, direct text', () => {
        const confident = 'The answer is 42. Use the sort() function to sort the list.';
        (0, vitest_1.expect)((0, confidence_analyzer_1.detectHedgingLanguage)(confident)).toBe(0);
    });
    (0, vitest_1.it)('returns a positive score for hedging-heavy text', () => {
        const hedged = 'I think this might be correct, but perhaps you should probably check. It seems likely it could work.';
        (0, vitest_1.expect)((0, confidence_analyzer_1.detectHedgingLanguage)(hedged)).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('returns a higher score for more hedging', () => {
        const light = 'This might work.';
        const heavy = 'I think this might possibly work, but perhaps it could be that maybe it seems somewhat wrong.';
        (0, vitest_1.expect)((0, confidence_analyzer_1.detectHedgingLanguage)(heavy)).toBeGreaterThan((0, confidence_analyzer_1.detectHedgingLanguage)(light));
    });
    (0, vitest_1.it)('returns a value in [0, 100]', () => {
        const text = 'maybe perhaps possibly arguably probably I think I believe it seems might could';
        const score = (0, confidence_analyzer_1.detectHedgingLanguage)(text);
        (0, vitest_1.expect)(score).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(score).toBeLessThanOrEqual(100);
    });
});
(0, vitest_1.describe)('trackConfidenceTrend', () => {
    (0, vitest_1.it)('returns 0 for fewer than 2 messages', () => {
        (0, vitest_1.expect)((0, confidence_analyzer_1.trackConfidenceTrend)([(0, helpers_1.makeMsg)('assistant', 'hello')])).toBe(0);
        (0, vitest_1.expect)((0, confidence_analyzer_1.trackConfidenceTrend)([])).toBe(0);
    });
    (0, vitest_1.it)('returns 0 when there are no assistant messages', () => {
        const msgs = [(0, helpers_1.makeMsg)('user', 'hello'), (0, helpers_1.makeMsg)('user', 'world')];
        (0, vitest_1.expect)((0, confidence_analyzer_1.trackConfidenceTrend)(msgs)).toBe(0);
    });
    (0, vitest_1.it)('returns a higher score when later messages are more hedged than earlier ones', () => {
        const confident = 'The answer is clear. Use this approach.';
        const hedged = 'I think this might possibly work, but perhaps it could be somewhat uncertain.';
        const decliningConfidence = [
            (0, helpers_1.makeMsg)('assistant', confident, 0),
            (0, helpers_1.makeMsg)('assistant', confident, 2000),
            (0, helpers_1.makeMsg)('assistant', confident, 4000),
            (0, helpers_1.makeMsg)('assistant', hedged, 6000),
            (0, helpers_1.makeMsg)('assistant', hedged, 8000),
            (0, helpers_1.makeMsg)('assistant', hedged, 10000),
        ];
        const stableConfidence = [
            (0, helpers_1.makeMsg)('assistant', confident, 0),
            (0, helpers_1.makeMsg)('assistant', confident, 2000),
            (0, helpers_1.makeMsg)('assistant', confident, 4000),
            (0, helpers_1.makeMsg)('assistant', confident, 6000),
            (0, helpers_1.makeMsg)('assistant', confident, 8000),
            (0, helpers_1.makeMsg)('assistant', confident, 10000),
        ];
        (0, vitest_1.expect)((0, confidence_analyzer_1.trackConfidenceTrend)(decliningConfidence)).toBeGreaterThan((0, confidence_analyzer_1.trackConfidenceTrend)(stableConfidence));
    });
});
(0, vitest_1.describe)('calculateConfidenceDrift', () => {
    (0, vitest_1.it)('returns 0 for fewer than 2 messages', () => {
        (0, vitest_1.expect)((0, confidence_analyzer_1.calculateConfidenceDrift)([])).toBe(0);
        (0, vitest_1.expect)((0, confidence_analyzer_1.calculateConfidenceDrift)([(0, helpers_1.makeMsg)('user', 'hello')])).toBe(0);
    });
    (0, vitest_1.it)('returns a value in [0, 100]', () => {
        const msgs = (0, helpers_1.conversation)([
            ['Help me', 'I think this might possibly work, but I am not entirely sure.'],
            ['More help', 'Perhaps you could maybe try this approach, though I am uncertain.'],
            ['Continue', 'I believe this could be right, but I am not fully confident.'],
        ]);
        const score = (0, confidence_analyzer_1.calculateConfidenceDrift)(msgs);
        (0, vitest_1.expect)(score).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(score).toBeLessThanOrEqual(100);
    });
    (0, vitest_1.it)('returns a higher score when hedging increases over time versus staying constant', () => {
        // Increasing hedging: confident early, very uncertain late
        const increasingHedge = (0, helpers_1.conversation)([
            ['?', 'Use the sort() function. It sorts in ascending order by default.'],
            ['?', 'Set reverse=True for descending order. This is well-documented.'],
            ['?', 'I think this might work, but I am not entirely sure.'],
            ['?', 'Perhaps this could maybe work, though I am not confident.'],
            ['?', 'I believe this might be right but I am uncertain, possibly wrong.'],
            ['?', 'I am really not sure, it seems like it could perhaps be the case.'],
        ]);
        // Constant hedging throughout (no trend)
        const constantHedge = (0, helpers_1.conversation)([
            ['?', 'I think this might work, but perhaps it could be wrong.'],
            ['?', 'Maybe, it seems like it could perhaps be the case.'],
            ['?', 'I believe this might be right but I am uncertain.'],
            ['?', 'Perhaps this could maybe work, though I am not confident.'],
            ['?', 'I think this might work, but perhaps it could be wrong.'],
            ['?', 'Maybe, it seems like it could perhaps be the case.'],
        ]);
        (0, vitest_1.expect)((0, confidence_analyzer_1.calculateConfidenceDrift)(increasingHedge)).toBeGreaterThan((0, confidence_analyzer_1.calculateConfidenceDrift)(constantHedge));
    });
});
