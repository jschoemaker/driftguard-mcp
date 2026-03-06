import * as path from 'path';
import { DriftAnalysis, DriftFactors } from './core/types';
import { DriftSnapshot } from './storage';

// ============================================================
// ANSI helpers
// ============================================================

const C = {
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  dim:    '\x1b[90m',
  bold:   '\x1b[1m',
  reset:  '\x1b[0m',
} as const;

export const LEVEL_EMOJI: Record<string, string> = {
  fresh:    '🟢',
  warming:  '🟡',
  drifting: '🔴',
  polluted: '⚫',
};

export function levelColor(level: string): string {
  switch (level) {
    case 'fresh':    return C.green;
    case 'warming':  return C.yellow;
    case 'drifting': return C.red;
    case 'polluted': return C.dim;
    default:         return C.reset;
  }
}

// ============================================================
// Bar + trend helpers
// ============================================================

/** Render a 10-char Unicode block bar for a 0-100 score. */
function bar(score: number, width = 10): string {
  const filled = Math.min(width, Math.round((score / 100) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Return a trend arrow comparing current to previous value (threshold ±2). */
function trendArrow(cur: number, prev: number | undefined): string {
  if (prev === undefined) return ' ';
  if (cur - prev > 2)  return '↗';
  if (prev - cur > 2)  return '↘';
  return '→';
}

/** Compact sparkline from an array of 0-100 scores using block elements. */
export function sparkline(scores: number[]): string {
  const CHARS = '▁▂▃▄▅▆▇█';
  return scores.map(s => CHARS[Math.min(7, Math.floor(s / 12.5))]).join('');
}

// ============================================================
// Factor display labels
// ============================================================

const FACTOR_LABELS: Partial<Record<keyof DriftFactors, string>> = {
  contextSaturation:     'Context Saturation',
  uncertaintySignals:    'Uncertainty',
  repetition:            'Repetition',
  goalDistance:          'Goal Distance',
  confidenceDrift:       'Confidence Drift',
  responseLengthCollapse: 'Length Collapse',
};

// ============================================================
// Dashboard renderer
// ============================================================

/**
 * Render a full dashboard block for the CLI watcher.
 *
 * @param analysis   Current drift analysis
 * @param prevFactors Factor scores from the previous render (for trend arrows)
 * @param sessionFile Absolute path to the active .jsonl session file
 */
export function renderDashboard(
  analysis: DriftAnalysis,
  prevFactors: Partial<DriftFactors> | undefined,
  sessionFile: string,
): string {
  const color   = levelColor(analysis.level);
  const emoji   = LEVEL_EMOJI[analysis.level] ?? '❓';
  const project = path.basename(path.dirname(sessionFile));
  const time    = new Date().toLocaleTimeString();
  const sep     = `${C.dim}${'━'.repeat(54)}${C.reset}`;

  const lines: string[] = [
    sep,
    `  ${C.bold}DriftCLI${C.reset}  •  ${project}  •  ${time}`,
    ``,
    `  Score  ${color}${C.bold}${analysis.score}${C.reset} ${emoji} ${color}${analysis.level.toUpperCase()}${C.reset}    Messages  ${analysis.messageCount}`,
    ``,
  ];

  for (const [key, val] of Object.entries(analysis.factors) as [keyof DriftFactors, number][]) {
    const prev    = prevFactors?.[key];
    const arrow   = trendArrow(val, prev);
    const label   = (FACTOR_LABELS[key] ?? key).padEnd(20);
    const barStr  = `${color}${bar(val)}${C.reset}`;
    const valStr  = String(Math.round(val)).padStart(3);
    lines.push(`  ${label} ${barStr}  ${valStr}  ${arrow}`);
  }

  lines.push(sep);
  return lines.join('\n');
}

// ============================================================
// Trend summary renderer (for get_trend() MCP tool)
// ============================================================

/**
 * Format a list of historical snapshots as a trend summary string.
 * Used by the get_trend() MCP tool.
 */
export function renderTrend(snapshots: DriftSnapshot[]): string {
  if (snapshots.length === 0) {
    return 'No drift history recorded yet.\nTip: Call get_drift() a few times to build up trend data.';
  }

  const scores  = snapshots.map(s => s.score);
  const first   = scores[0];
  const last    = scores[scores.length - 1];
  const peak    = Math.max(...scores);
  const peakSnap = snapshots[scores.indexOf(peak)];
  const avg     = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const delta   = last - first;

  let trendLabel: string;
  if (delta > 15)      trendLabel = '↗ rising';
  else if (delta < -15) trendLabel = '↘ falling';
  else                  trendLabel = '→ stable';

  const scoreSeq = scores.length <= 10
    ? scores.join(' → ')
    : [...scores.slice(0, 3), '…', ...scores.slice(-3)].join(' → ');

  const peakEmoji = LEVEL_EMOJI[peakSnap.level] ?? '❓';
  const latestEmoji = LEVEL_EMOJI[snapshots[snapshots.length - 1].level] ?? '❓';

  const lines: string[] = [
    `Drift Trend — last ${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'}`,
    ``,
    `  ${sparkline(scores)}`,
    `  ${scoreSeq}`,
    ``,
    `  Trend:   ${trendLabel}  (${delta >= 0 ? '+' : ''}${delta} over ${snapshots.length} checks)`,
    `  Peak:    ${peak} ${peakEmoji} ${peakSnap.level.toUpperCase()}`,
    `  Average: ${avg}`,
    `  Latest:  ${last} ${latestEmoji} ${snapshots[snapshots.length - 1].level.toUpperCase()}`,
  ];

  if (last > 60) {
    lines.push(``, `⚠️  Drift is high. Consider calling get_handoff() to start fresh.`);
  }

  return lines.join('\n');
}
