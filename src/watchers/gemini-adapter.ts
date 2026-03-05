import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

interface GeminiLine {
  role: 'user' | 'model';
  parts: Array<{ text?: string }>;
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

        const text = (entry.parts ?? [])
          .map(p => p.text ?? '')
          .join('\n')
          .trim();

        if (!text) continue;

        const ts = entry.timestamp
          ? new Date(entry.timestamp).getTime()
          : Date.now();

        messages.push({
          id: `gemini-${index++}`,
          role: entry.role === 'model' ? 'assistant' : 'user',
          content: text,
          timestamp: isFinite(ts) ? ts : Date.now(),
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
