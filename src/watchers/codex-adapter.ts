import * as fs from 'fs';
import * as path from 'path';
import { ParserAdapter, ParsedMessage } from './adapter';
import { resolveHomeDir } from '../utils';

interface UserMessagePayload {
  type: 'user_message';
  message: string;
}

interface AgentMessagePayload {
  type: 'agent_message';
  message: string;
}

interface ExecCommandEndPayload {
  type: 'ExecCommandEnd';
  aggregated_output?: string;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
}

interface TokenCountPayload {
  type: 'token_count';
  info?: {
    total_token_usage?: TokenUsage;
    last_token_usage?: TokenUsage;
    model_context_window?: number;
  } | null;
}

type EventPayload = UserMessagePayload | AgentMessagePayload | ExecCommandEndPayload | TokenCountPayload | { type: string };

interface CodexLine {
  timestamp?: string;
  type: 'event_msg' | 'session_meta' | string;
  payload?: EventPayload;
}

export class CodexAdapter implements ParserAdapter {
  readonly name = 'codex';

  canParse(filePath: string): boolean {
    return filePath.includes('.codex') && filePath.endsWith('.jsonl');
  }

  parse(filePath: string): ParsedMessage[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    const messages: ParsedMessage[] = [];
    let index = 0;
    let pendingToolTokens = 0;
    let pendingInputTokens: number | undefined;
    let pendingSessionInputTokens: number | undefined;
    let pendingContextWindowTokens: number | undefined;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CodexLine;

        if (entry.type !== 'event_msg' || !entry.payload) continue;

        const payload = entry.payload;

        if (payload.type === 'token_count') {
          const tc = payload as TokenCountPayload;
          const lastUsage = tc.info?.last_token_usage;
          const totalUsage = tc.info?.total_token_usage;
          // inputTokens = current-request context pressure (basis for context depth)
          if (lastUsage?.input_tokens) pendingInputTokens = lastUsage.input_tokens;
          // sessionInputTokens = cumulative session cost (basis for Session size display)
          if (totalUsage?.input_tokens) pendingSessionInputTokens = totalUsage.input_tokens;
          // contextWindowTokens = runtime denominator for context depth ratio
          if (tc.info?.model_context_window) pendingContextWindowTokens = tc.info.model_context_window;
          if (totalUsage?.reasoning_output_tokens) pendingToolTokens += totalUsage.reasoning_output_tokens;
          continue;
        }

        if (payload.type === 'ExecCommandEnd') {
          const output = (payload as ExecCommandEndPayload).aggregated_output ?? '';
          pendingToolTokens += Math.round(output.length / 4);
          continue;
        }

        if (payload.type !== 'user_message' && payload.type !== 'agent_message') continue;

        const text = ((payload as UserMessagePayload | AgentMessagePayload).message ?? '').trim();
        if (!text) continue;

        const role = payload.type === 'agent_message' ? 'assistant' : 'user';
        const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();
        const toolTokens = pendingToolTokens;
        pendingToolTokens = 0;
        const inputTokens = pendingInputTokens;
        pendingInputTokens = undefined;
        const sessionInputTokens = pendingSessionInputTokens;
        pendingSessionInputTokens = undefined;
        const contextWindowTokens = pendingContextWindowTokens;
        pendingContextWindowTokens = undefined;

        messages.push({
          id: `codex-${index++}`,
          role,
          content: text,
          timestamp: isFinite(ts) ? ts : Date.now(),
          ...(toolTokens > 0 ? { toolTokens } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
          ...(sessionInputTokens !== undefined ? { sessionInputTokens } : {}),
          ...(contextWindowTokens !== undefined ? { contextWindowTokens } : {}),
        });
      } catch {
        // skip malformed lines
      }
    }

    // Codex writes token_count AFTER agent_message (post-turn accounting).
    // Patch trailing data onto the last message, but only safe fields:
    // - sessionInputTokens: total cumulative cost — exactly what post-turn accounting measures
    // - contextWindowTokens: model limit, stable across every event
    // NOT inputTokens: a post-response last_token_usage includes output context too,
    // which would inflate context depth beyond what was actually sent as input.
    if (messages.length > 0) {
      const last = messages[messages.length - 1];
      if (pendingSessionInputTokens !== undefined) last.sessionInputTokens  = pendingSessionInputTokens;
      if (pendingContextWindowTokens !== undefined) last.contextWindowTokens = pendingContextWindowTokens;
    }

    return messages;
  }

  findLatest(): string | null {
    const codexDir = path.join(
      resolveHomeDir(),
      '.codex',
    );

    if (!fs.existsSync(codexDir)) return null;

    let latestFile: string | null = null;
    let latestTime = 0;
    let filesScanned = 0;
    const MAX_DEPTH = 10;
    const MAX_FILES = 500;

    const scan = (dir: string, depth: number) => {
      if (depth > MAX_DEPTH || filesScanned >= MAX_FILES) return;
      try {
        for (const entry of fs.readdirSync(dir)) {
          if (filesScanned >= MAX_FILES) break;
          const fullPath = path.join(dir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isSymbolicLink()) continue;
            if (stat.isDirectory()) {
              scan(fullPath, depth + 1);
            } else if (entry.endsWith('.jsonl')) {
              filesScanned++;
              if (stat.mtimeMs > latestTime) {
                latestTime = stat.mtimeMs;
                latestFile = fullPath;
              }
            }
          } catch {
            continue;
          }
        }
      } catch {
        // skip unreadable dirs
      }
    };

    scan(codexDir, 0);
    return latestFile;
  }
}
