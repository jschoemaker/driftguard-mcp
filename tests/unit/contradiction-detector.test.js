"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const contradiction_detector_1 = require("../../src/core/contradiction-detector");
const helpers_1 = require("../helpers");
function assistantMsgs(...contents) {
    return contents.map((c, i) => (0, helpers_1.makeMsg)('assistant', c, i * 2000));
}
(0, vitest_1.describe)('countContradictions', () => {
    (0, vitest_1.it)('returns 0 for an empty list', () => {
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)([])).toBe(0);
    });
    (0, vitest_1.it)('returns 0 for a single clean message', () => {
        const msgs = assistantMsgs('Use the sorted() function to sort a list.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBe(0);
    });
    (0, vitest_1.it)('returns 0 for multiple clean, non-contradicting messages', () => {
        const msgs = assistantMsgs('Python lists are mutable ordered collections.', 'You can append items using list.append(item).', 'Use list.sort() for in-place sorting.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBe(0);
    });
    (0, vitest_1.it)('detects "I apologize" self-correction', () => {
        const msgs = assistantMsgs('You should use the append() method.', 'I apologize, I was referring to the wrong method.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('detects "I was wrong" self-correction', () => {
        const msgs = assistantMsgs('The answer is 42.', 'I was wrong — the correct answer is actually 43.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('detects "I made a mistake" pattern', () => {
        const msgs = assistantMsgs('This approach is correct.', 'I made a mistake in my previous answer, let me correct that.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('detects "correction:" prefix', () => {
        const msgs = assistantMsgs('Use list.sort() for descending order.', 'Correction: you need to pass reverse=True to sort descending.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(msgs)).toBeGreaterThan(0);
    });
    (0, vitest_1.it)('counts more contradictions in a heavily self-correcting session', () => {
        const contradicting = assistantMsgs('You should use class A.', "Actually, you shouldn't use class A. I apologize for the confusion.", 'Use method B.', 'I was wrong — method B is deprecated. Use method C instead.', 'This approach is correct.', 'Correction: I made a mistake. Let me redo that.');
        const clean = assistantMsgs('Use class A for this task.', 'Method B is the best choice here.', 'This approach is well-established and correct.');
        (0, vitest_1.expect)((0, contradiction_detector_1.countContradictions)(contradicting)).toBeGreaterThan((0, contradiction_detector_1.countContradictions)(clean));
    });
});
