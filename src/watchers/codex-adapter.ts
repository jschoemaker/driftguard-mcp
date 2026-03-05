import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

interface ToolCall {
  type: 'function';
  function: { name: string; arguments: string };
}

interface CodexLine {
  role: 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; input?: Record<string, unknown> }>;
  tool_calls?: ToolCall[];
  timestamp?: string | number;
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

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CodexLine;

        // role:tool lines are tool results — count their tokens and carry forward
        if (entry.role === 'tool') {
          const resultText = typeof entry.content === 'string' ? entry.content : '';
          pendingToolTokens += Math.round(resultText.length / 4);
          continue;
        }

        if (entry.role !== 'user' && entry.role !== 'assistant') continue;

        let text = '';
        let toolTokens = pendingToolTokens;
        pendingToolTokens = 0;

        if (typeof entry.content === 'string') {
          text = entry.content.trim();
        } else if (Array.isArray(entry.content)) {
          for (const block of entry.content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              text += (text ? '\n' : '') + block.text.trim();
            } else if (block.type === 'tool_use' && block.input) {
              toolTokens += Math.round(JSON.stringify(block.input).length / 4);
            }
          }
          text = text.trim();
        }

        // OpenAI-style tool_calls array on assistant messages
        if (entry.tool_calls) {
          for (const tc of entry.tool_calls) {
            if (tc.function?.arguments) {
              toolTokens += Math.round(tc.function.arguments.length / 4);
            }
          }
        }

        if (!text) continue;

        let ts = Date.now();
        if (entry.timestamp) {
          const parsed = typeof entry.timestamp === 'number'
            ? entry.timestamp
            : new Date(entry.timestamp).getTime();
          if (isFinite(parsed)) ts = parsed;
        }

        messages.push({
          id: `codex-${index++}`,
          role: entry.role as 'user' | 'assistant',
          content: text,
          timestamp: ts,
          ...(toolTokens > 0 ? { toolTokens } : {}),
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
