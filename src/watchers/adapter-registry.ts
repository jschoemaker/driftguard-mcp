import { ParserAdapter } from './adapter';
import { ClaudeAdapter } from './claude-adapter';
import { GeminiAdapter } from './gemini-adapter';
import { CodexAdapter } from './codex-adapter';

export const ADAPTERS: ParserAdapter[] = [new ClaudeAdapter(), new GeminiAdapter(), new CodexAdapter()];

export function detectAdapter(filePath: string): ParserAdapter {
  return ADAPTERS.find(a => a.canParse(filePath)) ?? ADAPTERS[0];
}

/**
 * Returns the adapter pinned by the DRIFTCLI_ADAPTER env var, or null if not set.
 * Used by SessionResolver to restrict session lookup to the calling CLI's own sessions.
 */
export function getPinnedAdapter(): ParserAdapter | null {
  const name = process.env.DRIFTCLI_ADAPTER;
  if (!name) return null;
  return ADAPTERS.find(a => a.name === name) ?? null;
}
