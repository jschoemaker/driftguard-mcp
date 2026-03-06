import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

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

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CodexLine;

        if (entry.type !== 'event_msg' || !entry.payload) continue;

        const payload = entry.payload;

        if (payload.type === 'token_count') {
          const tc = payload as TokenCountPayload;
          const usage = tc.info?.total_token_usage;
          if (usage?.input_tokens) pendingInputTokens = usage.input_tokens;
          if (usage?.reasoning_output_tokens) pendingToolTokens += usage.reasoning_output_tokens;
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

        messages.push({
          id: `codex-${index++}`,
          role,
          content: text,
          timestamp: isFinite(ts) ? ts : Date.now(),
          ...(toolTokens > 0 ? { toolTokens } : {}),
          ...(inputTokens !== undefined ? { inputTokens } : {}),
        });
      } catch {
        // skip malformed lines
      }
    }

    return messages;
  }

  findLatest(): string | null {
    const codexDir = path.join(
      process.env.DRIFTCLI_HOME ?? os.homedir(),
      '.codex',
    );

    if (!fs.existsSync(codexDir)) return null;

    let latestFile: string | null = null;
    let latestTime = 0;

    const scan = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, entry);
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              scan(fullPath);
            } else if (entry.endsWith('.jsonl') && stat.mtimeMs > latestTime) {
              latestTime = stat.mtimeMs;
              latestFile = fullPath;
            }
          } catch {
            continue;
          }
        }
      } catch {
        // skip unreadable dirs
      }
    };

    scan(codexDir);
    return latestFile;
  }
}
