import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DriftWeights, DEFAULT_WEIGHTS } from './core/types';

// ============================================================
// Weight Presets
// ============================================================

/**
 * Named weight configurations for common session types.
 * Set via "preset" in ~/.driftclirc or .driftcli:
 *
 *   { "preset": "coding" }
 *
 * Explicit "weights" entries always override the preset.
 */
export const WEIGHT_PRESETS: Record<string, DriftWeights> = {
  /** Equal importance across all six factors. */
  strict: {
    contextSaturation:      1 / 6,
    uncertaintySignals:     1 / 6,
    repetition:             1 / 6,
    goalDistance:           1 / 6,
    confidenceDrift:        1 / 6,
    responseLengthCollapse: 1 / 6,
  },
  /** Emphasises repetition, length collapse, and context depth — good for focused coding sessions. */
  coding: {
    contextSaturation:      0.24,
    uncertaintySignals:     0.10,
    repetition:             0.29,
    goalDistance:           0.18,
    confidenceDrift:        0.07,
    responseLengthCollapse: 0.12,
  },
  /** Emphasises goal alignment — good for research or planning. */
  research: {
    contextSaturation:      0.15,
    uncertaintySignals:     0.15,
    repetition:             0.13,
    goalDistance:           0.45,
    confidenceDrift:        0.07,
    responseLengthCollapse: 0.05,
  },
  /** Forgiving preset for brainstorming. */
  brainstorm: {
    contextSaturation:      0.22,
    uncertaintySignals:     0.13,
    repetition:             0.25,
    goalDistance:           0.12,
    confidenceDrift:        0.18,
    responseLengthCollapse: 0.10,
  },
};

// ============================================================
// Config Schema
// ============================================================

/**
 * Raw shape accepted in config files (weights and preset are both optional).
 * loadConfig() resolves these into the final DriftConfig.
 */
interface RawConfig {
  preset?: string;
  weights?: Partial<DriftWeights>;
  warnThreshold?: number;
  sessionResolution?: { cacheTtlMs?: number };
  storage?: { enabled?: boolean; directory?: string };
}

export interface DriftConfig {
  /** Resolved factor weights. Prefer using `preset` in config files. */
  weights: DriftWeights;
  /**
   * Named preset used to derive weights. Stored so callers can display
   * which preset is active. Undefined when default weights are used.
   */
  preset?: string;
  /** Drift score at which get_drift() emits a warning. Default: 60. */
  warnThreshold: number;
  sessionResolution: {
    /** How long (ms) to cache the resolved session file path. Default: 5000. */
    cacheTtlMs: number;
  };
  storage: {
    /** Whether to persist drift snapshots to disk. Default: false. */
    enabled: boolean;
    /** Override directory for snapshot files. Default: ~/.driftcli/history */
    directory?: string;
  };
}

export const DEFAULT_CONFIG: DriftConfig = {
  weights: { ...DEFAULT_WEIGHTS },
  warnThreshold: 60,
  sessionResolution: {
    cacheTtlMs: 5000,
  },
  storage: {
    enabled: true,
  },
};

// ============================================================
// Loader
// ============================================================

/**
 * Loads and merges configuration from two optional sources:
 *
 *   1. Global:      ~/.driftclirc      (JSON)
 *   2. Per-project: <cwd>/.driftcli    (JSON)
 *
 * Weight resolution order (lowest → highest priority):
 *   DEFAULT_WEIGHTS → preset weights → explicit "weights" in global config
 *     → explicit "weights" in per-project config
 *
 * Per-project settings override global settings; both override defaults.
 * Parse errors are warned and skipped.
 */
export function loadConfig(): DriftConfig {
  // DRIFTCLI_HOME overrides os.homedir() — useful for testing and non-standard setups
  const homeDir = process.env.DRIFTCLI_HOME ?? os.homedir();
  const globalRaw  = tryLoadJson(path.join(homeDir, '.driftclirc')) ?? {};
  const projectRaw = tryLoadJson(path.join(process.cwd(), '.driftcli')) ?? {};

  // Merge non-weight scalar fields: defaults → global → project
  const warnThreshold = projectRaw.warnThreshold
    ?? globalRaw.warnThreshold
    ?? DEFAULT_CONFIG.warnThreshold;

  const cacheTtlMs = projectRaw.sessionResolution?.cacheTtlMs
    ?? globalRaw.sessionResolution?.cacheTtlMs
    ?? DEFAULT_CONFIG.sessionResolution.cacheTtlMs;

  const storageEnabled = projectRaw.storage?.enabled
    ?? globalRaw.storage?.enabled
    ?? DEFAULT_CONFIG.storage.enabled;

  const storageDirectory = projectRaw.storage?.directory
    ?? globalRaw.storage?.directory;

  // Resolve weights: DEFAULT_WEIGHTS → preset → global weights → project weights
  const presetName = projectRaw.preset ?? globalRaw.preset;
  let weights: DriftWeights = { ...DEFAULT_WEIGHTS };

  if (presetName !== undefined) {
    const presetWeights = WEIGHT_PRESETS[presetName];
    if (presetWeights) {
      weights = { ...presetWeights };
    } else {
      console.warn(`[driftcli] Unknown preset "${presetName}" — using default weights`);
    }
  }

  // Explicit weight overrides (partial) applied on top of preset
  if (globalRaw.weights) {
    weights = { ...weights, ...globalRaw.weights };
  }
  if (projectRaw.weights) {
    weights = { ...weights, ...projectRaw.weights };
  }

  return {
    weights,
    preset: presetName,
    warnThreshold,
    sessionResolution: { cacheTtlMs },
    storage: { enabled: storageEnabled, ...(storageDirectory ? { directory: storageDirectory } : {}) },
  };
}

// ============================================================
// Helpers
// ============================================================

function tryLoadJson(filePath: string): RawConfig | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as RawConfig;
  } catch (err) {
    console.warn(
      `[driftcli] Could not load config from ${filePath}: ${err instanceof Error ? err.message : err}`,
    );
    return null;
  }
}
