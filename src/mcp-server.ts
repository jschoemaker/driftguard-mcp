import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SessionResolver } from './watchers/session-resolver';
import { calculateDrift } from './core/drift-calculator';
import { scoreToLevel } from './core/types';
import { loadConfig } from './config';
import { Storage } from './storage';
import { renderTrend, sparkline } from './ui';


const config   = loadConfig();
const resolver = new SessionResolver(config.sessionResolution.cacheTtlMs);
const storage  = config.storage.enabled
  ? new Storage(config.storage.directory)
  : null;

const server = new Server(
  { name: 'driftcli', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_drift',
      description: 'Returns the current drift score and factor breakdown for the active Claude Code session. Call this to check if the conversation context is degrading.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_handoff',
      description: 'Generates a handoff prompt summarizing the current session state. Use this when drift score is high (>60) to help start a fresh context.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_trend',
      description: 'Returns the drift history trend for the current session. Shows sparkline, score sequence, peak, average, and trajectory.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

const LEVEL_EMOJI: Record<string, string> = {
  fresh: '🟢',
  warming: '🟡',
  drifting: '🔴',
  polluted: '⚫',
};

function buildHandoff(): string {
  return [
    `Please write a \`handoff.md\` file in the current working directory with the following structure:`,
    ``,
    `## What we accomplished`,
    `A clear summary of everything completed this session.`,
    ``,
    `## Current state`,
    `Where things stand right now — what's working, what's broken, what's in progress.`,
    ``,
    `## Files modified`,
    `List of files changed this session and what changed in each.`,
    ``,
    `## Open questions / next steps`,
    `Anything unresolved, pending decisions, or what should be done next.`,
    ``,
    `## Context for next session`,
    `Key decisions, constraints, or background a fresh session needs to continue without losing context.`,
    ``,
    `Write the file now.`,
  ].join('\n');
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  let sessionFile: string | null;
  try {
    sessionFile = resolver.resolve();
  } catch (err) {
    return { content: [{ type: 'text', text: `Error finding session: ${err instanceof Error ? err.message : err}` }] };
  }

  if (!sessionFile) {
    return { content: [{ type: 'text', text: 'No active Claude Code session found.' }] };
  }

  const adapter = resolver.getAdapter(sessionFile);
  let messages;
  try {
    messages = adapter.parse(sessionFile);
  } catch (err) {
    return { content: [{ type: 'text', text: `Error reading session file: ${err instanceof Error ? err.message : err}` }] };
  }

  if (messages.length < 2) {
    return { content: [{ type: 'text', text: 'Not enough messages to calculate drift yet.' }] };
  }

  const chatMessages = messages.map(m => ({
    ...m,
    platform: 'claude' as const,
    tabId: 0,
    chatId: 'cli',
    ...(m.toolTokens !== undefined ? { toolTokens: m.toolTokens } : {}),
  }));

  const analysis = calculateDrift(chatMessages, config.weights);
  const level = scoreToLevel(analysis.score);
  const emoji = LEVEL_EMOJI[level] ?? '❓';
  const adapterTag = adapter.name !== 'claude' ? ` (${adapter.name})` : '';

  if (request.params.name === 'get_drift') {
    let trendLine = '';
    if (storage) {
      const sessionKey = path.basename(sessionFile, '.jsonl');
      storage.record(sessionKey, analysis);
      const snapshots = storage.getHistory(sessionKey, 10);
      if (snapshots.length >= 3) {
        const scores = snapshots.map(s => s.score);
        const delta = scores[scores.length - 1] - scores[0];
        const arrow = delta > 10 ? '↗' : delta < -10 ? '↘' : '→';
        const sign = delta >= 0 ? '+' : '';
        trendLine = `Trend (last ${scores.length}): ${sparkline(scores)}  ${sign}${delta} over ${scores.length} checks ${arrow}`;
      }
    }

    const factors = Object.entries(analysis.factors)
      .map(([k, v]) => `  ${k}: ${(v as number).toFixed(1)}`)
      .join('\n');

    const isDegrading = analysis.score > config.warnThreshold;

    const lines = [
      `Drift Score: ${analysis.score} ${emoji} ${level.toUpperCase()}${adapterTag}`,
      `Messages: ${messages.length}`,
      ``,
      `Factor breakdown:`,
      factors,
      ``,
      isDegrading
        ? `⚠️ Context is degrading.`
        : `Context is healthy.`,
    ];

    if (trendLine) lines.push(``, trendLine);

    if (isDegrading) {
      lines.push(``, `---`, buildHandoff());
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  if (request.params.name === 'get_handoff') {
    return { content: [{ type: 'text', text: buildHandoff() }] };
  }

  if (request.params.name === 'get_trend') {
    if (!storage) {
      return {
        content: [{
          type: 'text',
          text: 'Trend history is disabled.\nSet storage.enabled=true in ~/.driftclirc to activate it.',
        }],
      };
    }
    const sessionKey = path.basename(sessionFile, '.jsonl');
    const snapshots  = storage.getHistory(sessionKey);
    return { content: [{ type: 'text', text: renderTrend(snapshots) }] };
  }

  return { content: [{ type: 'text', text: 'Unknown tool.' }] };
});

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
