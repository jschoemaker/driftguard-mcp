import * as path from 'path';
import { SessionResolver } from './watchers/session-resolver';
import { calculateDrift, DriftFactors } from './core/drift-calculator';
import { loadConfig } from './config';
import { Storage } from './storage';
import { renderDashboard, LEVEL_EMOJI } from './ui';

export function run() {
  const config  = loadConfig();
  const resolver = new SessionResolver(config.sessionResolution.cacheTtlMs);
  const storage  = config.storage.enabled
    ? new Storage(config.storage.directory)
    : null;

  const sessionFile = resolver.resolve();
  if (!sessionFile) {
    console.error('No session files found. Is your AI CLI running?');
    console.error('Tip: set DRIFTCLI_SESSION_ID=<uuid> to pin a specific session.');
    process.exit(1);
  }

  // Clear screen and move cursor to top-left on first render
  process.stdout.write('\x1b[2J\x1b[H');

  let lastMessageCount = 0;
  let prevFactors: Partial<DriftFactors> | undefined;

  function check() {
    const file = resolver.resolve();
    if (!file) return;

    try {
      const messages = resolver.getAdapter(file).parse(file);
      if (messages.length === lastMessageCount) return;
      lastMessageCount = messages.length;

      if (messages.length < 2) return;

      const chatMessages = messages.map(m => ({
        ...m,
        platform: 'claude' as const,
        tabId: 0,
        chatId: 'cli',
      }));

      const analysis = calculateDrift(chatMessages, config.weights);
      const level    = analysis.level;
      const emoji    = LEVEL_EMOJI[level] ?? '❓';

      // Update terminal title
      process.stdout.write(`\x1b]0;${emoji} ${analysis.score} – DriftCLI\x07`);

      // Move cursor to top-left and overwrite (no flicker)
      process.stdout.write('\x1b[H');
      process.stdout.write(renderDashboard(analysis, prevFactors, file) + '\n');

      prevFactors = { ...analysis.factors };

      if (storage) {
        const sessionKey = path.basename(file, '.jsonl');
        storage.record(sessionKey, analysis);
      }
    } catch (err) {
      console.warn(`[driftcli] Watcher error: ${err instanceof Error ? err.message : err}`);
    }
  }

  check();
  setInterval(check, 3000);
}

