import { ParserAdapter } from './adapter';
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { CodexAdapter } from './codex-adapter';

export const ADAPTERS: ParserAdapter[] = [new ClaudeAdapter(), new GeminiAdapter(), new CodexAdapter()];

export function detectAdapter(filePath: string): ParserAdapter {
  return ADAPTERS.find(a => a.canParse(filePath)) ?? ADAPTERS[0];
}
