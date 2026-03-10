import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { SessionResolver } from './watchers/session-resolver';
import { calculateDrift } from './core/drift-calculator';
import { DriftAnalysis } from './core/types';
import { loadConfig } from './config';
import { Storage } from './storage';
import { renderTrend, sparkline } from './ui';


const config   = loadConfig();
const resolver = new SessionResolver(config.sessionResolution.cacheTtlMs);
const storage  = config.storage.enabled
  ? new Storage(config.storage.directory)
  : null;

const server = new Server(
  { name: 'driftcli', version: '0.1.13' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_drift',
      description: 'Returns the current drift score and all 6 factor scores for the active session. Call this to check if the conversation context is degrading. Optionally pass a "goal" string to anchor goalDistance scoring to a specific objective. When context depth or repetition is high, a handoff suggestion is included automatically.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            description: "Optional: the user's original goal or task for this session. Improves goalDistance accuracy.",
          },
        },
      },
    },
    {
      name: 'get_handoff',
      description: 'Returns a structured prompt for the AI to write a handoff.md file in the current directory. The AI uses its full session context to fill in what was accomplished, current state, files modified, and next steps. Use this when drift is high (>60) before starting a fresh session.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'get_trend',
      description: 'Returns the drift history trend for the current session. Shows sparkline, score sequence, peak, average, and trajectory.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

function bar(score: number, width = 10): string {
  const filled = Math.round(Math.min(100, Math.max(0, score)) / 100 * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Build the get_drift() output.
 * Leads with an actionable recommendation driven by contextSaturation + repetition.
 * Score and factor details are secondary.
 */
function buildDriftOutput(
  analysis: DriftAnalysis,
  messageCount: number,
  trendLine: string,
  adapterTag: string,
  sessionSize?: number,
): string {
  const { factors, score } = analysis;

  // Recommendation driven by the two reliable primary signals
  const needsFreshNow  = factors.contextSaturation > 70 || factors.repetition > 65;
  const needsFreshSoon = factors.contextSaturation > 50 || factors.repetition > 45;
  const warming        = factors.contextSaturation > 35 || factors.repetition > 30;

  let headline: string;
  if (needsFreshNow) {
    const reasons: string[] = [];
    if (factors.contextSaturation > 70) reasons.push('context is full');
    if (factors.repetition > 65) reasons.push('responses are repeating heavily');
    headline = `⚠️  Start fresh now — ${reasons.join(' and ')}.`;
  } else if (needsFreshSoon) {
    const reasons: string[] = [];
    if (factors.contextSaturation > 50) reasons.push('context is getting deep');
    if (factors.repetition > 45) reasons.push('some repetition detected');
    headline = `🟡  Start fresh soon — ${reasons.join(' and ')}.`;
  } else if (warming) {
    headline = `🟡  Context is warming up — no action needed yet.`;
  } else {
    headline = `✅  Context is healthy.`;
  }

  // Factor rows — always show primary two, show others only when non-trivial
  const rows: string[] = [];
  const row = (label: string, val: number) => {
    rows.push(`  ${label.padEnd(20)} ${bar(val)}  ${String(Math.round(val)).padStart(3)}`);
  };

  row('Context depth', factors.contextSaturation);
  row('Repetition', factors.repetition);
  if (factors.responseLengthCollapse > 5)  row('Length collapse', factors.responseLengthCollapse);
  if (factors.goalDistance > 20)           row('Goal distance', factors.goalDistance);
  if (factors.uncertaintySignals > 10)     row('Uncertainty', factors.uncertaintySignals);
  if (factors.confidenceDrift > 10)        row('Confidence drift', factors.confidenceDrift);

  const lines = [
    headline,
    '',
    ...rows,
    '',
    `Score: ${score}/100 · ${messageCount} messages${adapterTag}`,
  ];

  if (sessionSize !== undefined) {
    lines.push(`Session size: ${sessionSize.toLocaleString('en-US')} input tokens total`);
  }

  if (trendLine) lines.push(trendLine);

  // Auto-trigger handoff suggestion when primary signals are high — independent of composite score
  const shouldHandoff = factors.contextSaturation > 60 || factors.repetition > 50;
  if (shouldHandoff) {
    lines.push('', '→ Call get_handoff() to get a structured prompt for writing handoff.md before starting fresh.');
  }

  return lines.join('\n');
}

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
    return { content: [{ type: 'text', text: 'No active session found.' }] };
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
  }));

  const rawGoal = typeof request.params.arguments?.goal === 'string'
    ? request.params.arguments.goal
    : undefined;
  const goal = rawGoal && rawGoal.length > 5000 ? rawGoal.slice(0, 5000) : rawGoal;

  const analysis = calculateDrift(chatMessages, config.weights, goal);
  const adapterTag = adapter.name !== 'claude' ? ` (${adapter.name})` : '';

  // Session size: Codex uses sessionInputTokens (cumulative cost); Claude/Gemini use
  // the latest inputTokens value (which already represents cumulative context at that turn).
  const sessionSize = (() => {
    const codexSize = [...chatMessages].reverse().find(m => (m.sessionInputTokens ?? 0) > 0)?.sessionInputTokens;
    if (codexSize !== undefined) return codexSize;
    return [...chatMessages].reverse().find(m => (m.inputTokens ?? 0) > 0)?.inputTokens;
  })();

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
      } else {
        trendLine = `Trend: building up (${snapshots.length}/3 checks recorded)`;
      }
    }

    return { content: [{ type: 'text', text: buildDriftOutput(analysis, messages.length, trendLine, adapterTag, sessionSize) }] };
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
