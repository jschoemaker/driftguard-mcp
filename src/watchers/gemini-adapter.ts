import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

interface GeminiToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

interface GeminiTokens {
  tool?: number;
}

interface GeminiMessage {
  id: string;
  timestamp?: string;
  type: 'user' | 'gemini' | 'info' | 'error';
  content: string | Array<{ text?: string }>;
  toolCalls?: GeminiToolCall[];
  tokens?: GeminiTokens;
}

interface GeminiSession {
  messages: GeminiMessage[];
}

export class GeminiAdapter implements ParserAdapter {
  readonly name = 'gemini';

  canParse(filePath: string): boolean {
    return filePath.includes('.gemini') && filePath.endsWith('.json');
  }

  parse(filePath: string): ParsedMessage[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    let session: GeminiSession;
    try {
      session = JSON.parse(raw) as GeminiSession;
    } catch {
      return [];
    }

    if (!Array.isArray(session.messages)) return [];

    const messages: ParsedMessage[] = [];
    let index = 0;
    // Carry tokens from empty-content gemini turns (tool-only / thinking-only) to next real message
    let pendingToolTokens = 0;
    let pendingInputTokens: number | undefined;

    for (const msg of session.messages) {
      if (msg.type !== 'user' && msg.type !== 'gemini') continue;

      let content: string;
      if (typeof msg.content === 'string') {
        content = msg.content.trim();
      } else if (Array.isArray(msg.content)) {
        content = msg.content.map((p: { text?: string }) => p.text ?? '').join('\n').trim();
      } else {
        continue;
      }

      // Empty gemini turns (tool calls or pure thinking) — accumulate their tokens and skip
      if (!content && msg.type === 'gemini') {
        pendingToolTokens += msg.tokens?.tool ?? 0;
        pendingToolTokens += msg.tokens?.thoughts ?? 0;
        if ((msg.tokens?.tool ?? 0) === 0 && msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            if (tc.args) pendingToolTokens += Math.round(JSON.stringify(tc.args).length / 4);
            if (tc.result) pendingToolTokens += Math.round(JSON.stringify(tc.result).length / 4);
          }
        }
        if (msg.tokens?.input) pendingInputTokens = msg.tokens.input;
        continue;
      }

      if (!content) continue; // skip empty user messages

      const role = msg.type === 'gemini' ? 'assistant' : 'user';
      const ts = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();

      // Merge pending tokens from preceding empty turns
      let toolTokens = pendingToolTokens + (msg.tokens?.tool ?? 0);
      pendingToolTokens = 0;

      // Thoughts tokens consume real context even though they're not visible content
      toolTokens += msg.tokens?.thoughts ?? 0;

      // Fall back to estimating from toolCalls when API count unavailable
      if ((msg.tokens?.tool ?? 0) === 0 && msg.toolCalls?.length) {
        for (const tc of msg.toolCalls) {
          if (tc.args) toolTokens += Math.round(JSON.stringify(tc.args).length / 4);
          if (tc.result) toolTokens += Math.round(JSON.stringify(tc.result).length / 4);
        }
      }

      const inputTokens = msg.tokens?.input ?? pendingInputTokens;
      pendingInputTokens = undefined;

      messages.push({
        id: `gemini-${index++}`,
        role,
        content,
        timestamp: isFinite(ts) ? ts : Date.now(),
        ...(toolTokens > 0 ? { toolTokens } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
      });
    }

    return messages;
  }

  findLatest(): string | null {
    const geminiTmp = path.join(
      process.env.DRIFTCLI_HOME ?? os.homedir(),
      '.gemini',
      'tmp',
    );

    if (!fs.existsSync(geminiTmp)) return null;

    let latestFile: string | null = null;
    let latestTime = 0;

    try {
      const sessionDirs = fs.readdirSync(geminiTmp)
        .map(d => path.join(geminiTmp, d))
        .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });

      for (const dir of sessionDirs) {
        const chatsDir = path.join(dir, 'chats');
        if (!fs.existsSync(chatsDir)) continue;
        try {
          const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.json'));
          for (const file of files) {
            const fullPath = path.join(chatsDir, file);
            try {
              const mtime = fs.statSync(fullPath).mtimeMs;
              if (mtime > latestTime) {
                latestTime = mtime;
                latestFile = fullPath;
              }
            } catch {
              continue;
            }
          }
        } catch {
          continue;
        }
      }
    } catch {
      return null;
    }

    return latestFile;
  }
}
