import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ParsedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Estimated tokens from tool_use / tool_result blocks in this message.
   *  Used only for contextSaturation — not included in semantic content. */
  toolTokens?: number;
  /** Exact API input token count for this turn (when provided by the model API).
   *  When present, contextSaturation uses this instead of word-count estimation. */
  inputTokens?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  // tool_use fields
  name?: string;
  input?: Record<string, unknown>;
  // tool_result fields
  content?: string | ContentBlock[];
}

function parseTimestamp(raw: unknown): number {
  if (typeof raw === 'number' && isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const ms = new Date(raw).getTime();
    if (isFinite(ms)) return ms;
  }
  return Date.now();
}

/**
 * Short exact-match strings and patterns that indicate hook/system noise
 * rather than real user content. Filtered out before scoring.
 */
const NOISE_PATTERNS: RegExp[] = [
  /^Tool loaded\.\s*$/,
  /^MCP server connected\.\s*$/,
  /^MCP server disconnected\.\s*$/,
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some(p => p.test(text));
}

export function parseJSONL(filePath: string): ParsedMessage[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim());
  const messages: ParsedMessage[] = [];
  let skipped = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Compact boundary: Claude's context was reset by compaction.
      // Drop all messages collected so far — they are no longer in Claude's context.
      if (entry.type === 'compact_boundary') {
        messages.length = 0;
        continue;
      }

      if (entry.type !== 'user' && entry.type !== 'assistant') continue;

      const content = entry.message?.content;
      let text = '';

      let toolTokens = 0;

      if (typeof content === 'string') {
        text = content.trim();
      } else if (Array.isArray(content)) {
        const blocks = content as ContentBlock[];
        text = blocks
          .filter(block => block.type === 'text' && typeof block.text === 'string')
          .map(block => (block.text as string).trim())
          .join('\n')
          .trim();

        for (const block of blocks) {
          if (block.type === 'tool_use' && block.input) {
            const inputText = JSON.stringify(block.input);
            toolTokens += Math.round(inputText.length / 4);
          } else if (block.type === 'tool_result') {
            const resultText = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as ContentBlock[])
                    .filter(b => b.type === 'text' && typeof b.text === 'string')
                    .map(b => b.text as string)
                    .join('\n')
                : '';
            toolTokens += Math.round(resultText.length / 4);
          }
        }
      }

      if (!text.trim()) continue;
      if (isNoise(text)) continue;

      // Real input token count from Claude API usage field.
      // Total context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens.
      // Only present on assistant messages; used by contextSaturation instead of estimation.
      let inputTokens: number | undefined;
      if (entry.type === 'assistant') {
        const usage = entry.message?.usage;
        if (usage) {
          const total = (usage.input_tokens ?? 0)
            + (usage.cache_creation_input_tokens ?? 0)
            + (usage.cache_read_input_tokens ?? 0);
          if (total > 0) inputTokens = total;
        }
      }

      messages.push({
        id: entry.uuid,
        role: entry.message.role,
        content: text,
        timestamp: parseTimestamp(entry.timestamp),
        ...(toolTokens > 0 ? { toolTokens } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
      });
    } catch {
      skipped++;
    }
  }

  if (skipped > 0) {
    const pct = Math.round((skipped / lines.length) * 100);
    console.warn(`[driftcli] Skipped ${skipped}/${lines.length} malformed JSONL lines (${pct}%) in ${path.basename(filePath)}`);
  }

  return messages;
}

/**
 * Search all project directories for a JSONL file whose name (UUID) matches
 * the given session ID. Used by SessionResolver when DRIFTCLI_SESSION_ID is set.
 */
function claudeProjectsDir(): string {
  // DRIFTCLI_HOME overrides os.homedir() — used in tests and non-standard setups
  return path.join(process.env.DRIFTCLI_HOME ?? os.homedir(), '.claude', 'projects');
}

export function findSessionByUUID(sessionId: string): string | null {
  const baseDir = claudeProjectsDir();

  if (!fs.existsSync(baseDir)) return null;

  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(baseDir)
      .map(d => path.join(baseDir, d))
      .filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  } catch {
    return null;
  }

  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        if (file.replace('.jsonl', '') === sessionId) {
          return path.join(dir, file);
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Convert a CWD path to the slug Claude Code uses as the project directory name.
 * e.g. "C:\Users\user\Desktop\myproject" → "C--Users-user-Desktop-myproject"
 */
export function cwdToProjectSlug(cwd: string): string {
  return cwd.replace(/[:\\/]/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Find the most recently modified .jsonl in the project directory that matches
 * the given CWD (defaults to process.cwd()). Returns null if the directory
 * doesn't exist (graceful fallback to findLatestSession).
 */
export function findSessionByCwd(cwd?: string): string | null {
  const slug = cwdToProjectSlug(cwd ?? process.cwd());
  const projectDir = path.join(claudeProjectsDir(), slug);

  if (!fs.existsSync(projectDir)) return null;

  let files: string[] = [];
  try {
    files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
  } catch {
    return null;
  }

  let latestFile: string | null = null;
  let latestTime = 0;

  for (const file of files) {
    const fullPath = path.join(projectDir, file);
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

  return latestFile;
}

export function findLatestSession(): string | null {
  const baseDir = claudeProjectsDir();

  if (!fs.existsSync(baseDir)) {
    console.warn(`[driftcli] Session directory not found: ${baseDir}`);
    return null;
  }

  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(baseDir)
      .map(d => path.join(baseDir, d))
      .filter(d => {
        try { return fs.statSync(d).isDirectory(); } catch { return false; }
      });
  } catch (err) {
    console.warn(`[driftcli] Could not read session directory: ${err instanceof Error ? err.message : err}`);
    return null;
  }

  let latestFile: string | null = null;
  let latestTime = 0;

  for (const dir of dirs) {
    let files: string[] = [];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
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
  }

  return latestFile;
}