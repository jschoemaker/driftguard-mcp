import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

interface FunctionCall {
  name: string;
  args?: Record<string, unknown>;
}

interface FunctionResponse {
  name: string;
  response?: Record<string, unknown>;
}

interface GeminiPart {
  text?: string;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
}

interface GeminiLine {
  role: 'user' | 'model';
  parts: GeminiPart[];
  timestamp?: string;
}

export class GeminiAdapter implements ParserAdapter {
  readonly name = 'gemini';

  canParse(filePath: string): boolean {
    return filePath.includes('.gemini') && filePath.endsWith('.jsonl');
  }

  parse(filePath: string): ParsedMessage[] {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());
    const messages: ParsedMessage[] = [];
    let index = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as GeminiLine;
        if (entry.role !== 'user' && entry.role !== 'model') continue;

        const parts = entry.parts ?? [];

        const text = parts
          .map(p => p.text ?? '')
          .join('\n')
          .trim();

        if (!text) continue;

        // Count tokens from tool call / tool result parts
        let toolTokens = 0;
        for (const part of parts) {
          if (part.functionCall?.args) {
            toolTokens += Math.round(JSON.stringify(part.functionCall.args).length / 4);
          }
          if (part.functionResponse?.response) {
            toolTokens += Math.round(JSON.stringify(part.functionResponse.response).length / 4);
          }
        }

        const ts = entry.timestamp
          ? new Date(entry.timestamp).getTime()
          : Date.now();

        messages.push({
          id: `gemini-${index++}`,
          role: entry.role === 'model' ? 'assistant' : 'user',
          content: text,
          timestamp: isFinite(ts) ? ts : Date.now(),
          ...(toolTokens > 0 ? { toolTokens } : {}),
        });
      } catch {
        // skip malformed lines
      }
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
        try {
          const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
          for (const file of files) {
            const fullPath = path.join(dir, file);
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
