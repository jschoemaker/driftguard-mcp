"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeMsg = makeMsg;
exports.conversation = conversation;
exports.repeatPair = repeatPair;
let _counter = 0;
/** Create a single ChatMessage for testing. Timestamps are sequential by default. */
function makeMsg(role, content, offsetMs) {
    const id = ++_counter;
    return {
        id: `msg-${id}`,
        role,
        content,
        timestamp: 1700000000000 + (offsetMs ?? id * 2000),
        platform: 'claude',
        tabId: 0,
        chatId: 'test',
    };
}
/**
 * Build a conversation from [user, assistant] pairs.
 * Timestamps are spaced 2 s apart per message.
 */
function conversation(pairs) {
    const messages = [];
    let t = 0;
    for (const [userText, assistantText] of pairs) {
        messages.push(makeMsg('user', userText, t));
        t += 2000;
        messages.push(makeMsg('assistant', assistantText, t));
        t += 2000;
    }
    return messages;
}
/** Repeat a [user, assistant] pair n times (useful for repetition tests). */
function repeatPair(user, assistant, n) {
    return conversation(Array.from({ length: n }, () => [user, assistant]));
}
