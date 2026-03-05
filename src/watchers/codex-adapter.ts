import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ParserAdapter, ParsedMessage } from './adapter';

interface CodexLine {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
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

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as CodexLine;
        if (entry.role !== 'user' && entry.role !== 'assistant') continue;

        let text = '';
        if (typeof entry.content === 'string') {
          text = entry.content.trim();
        } else if (Array.isArray(entry.content)) {
          text = entry.content
            .filter(b => b.type === 'text' && typeof b.text === 'string')
            .map(b => (b.text as string).trim())
            .join('\n')
            .trim();
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
          role: entry.role,
          content: text,
          timestamp: ts,
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
