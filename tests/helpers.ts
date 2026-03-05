import { ChatMessage } from '../src/core/types';

let _counter = 0;

/** Create a single ChatMessage for testing. Timestamps are sequential by default. */
export function makeMsg(
  role: 'user' | 'assistant',
  content: string,
  offsetMs?: number,
): ChatMessage {
  const id = ++_counter;
  return {
    id: `msg-${id}`,
    role,
    content,
    timestamp: 1_700_000_000_000 + (offsetMs ?? id * 2000),
    platform: 'claude',
    tabId: 0,
    chatId: 'test',
  };
}

/**
 * Build a conversation from [user, assistant] pairs.
 * Timestamps are spaced 2 s apart per message.
 */
export function conversation(pairs: [string, string][]): ChatMessage[] {
  const messages: ChatMessage[] = [];
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
export function repeatPair(user: string, assistant: string, n: number): ChatMessage[] {
  return conversation(Array.from({ length: n }, () => [user, assistant] as [string, string]));
}
