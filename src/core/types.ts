// ============================================================
// DriftGuard — Core Types
// ============================================================

export type Platform = 'chatgpt' | 'claude' | 'gemini';
export type DriftLevel = 'fresh' | 'warming' | 'drifting' | 'polluted';
export type MessageRole = 'user' | 'assistant';

// --- Chat Messages ---

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  platform: Platform;
  tabId: number;
  chatId: string;
  chatTitle?: string;
  /** Estimated tokens from tool calls in this message (tool_use + tool_result blocks).
   *  Used only by contextSaturation — not included in semantic analysis content. */
  toolTokens?: number;
  /** Exact API input token count for this turn (when provided by the model API).
   *  When present, contextSaturation uses this instead of word-count estimation. */
  inputTokens?: number;
}

// --- Drift Analysis ---

export interface DriftFactors {
  contextSaturation: number;      // 0-100: token depth (real API counts where available)
  topicScatter: number;           // 0-100: topic fragmentation (TF-IDF cosine similarity)
  uncertaintySignals: number;     // 0-100: explicit self-corrections
  repetition: number;             // 0-100: repeated content (3-gram sliding window)
  goalDistance: number;           // 0-100: semantic distance from original goal
  confidenceDrift: number;        // 0-100: hedging language trend (early vs late)
  responseLengthCollapse: number; // 0-100: assistant response length decline (early vs late)
}

export interface DriftWeights {
  contextSaturation: number;      // default 0.35 — most reliable: real token depth
  topicScatter: number;           // default 0.04 — noisy: lexical not semantic
  uncertaintySignals: number;     // default 0.02 — high precision, low recall
  repetition: number;             // default 0.35 — most reliable: model recycling output
  goalDistance: number;           // default 0.08 — lexical proxy, noisy
  confidenceDrift: number;        // default 0.01 — trend signal, supporting only
  responseLengthCollapse: number; // default 0.15 — reliable symptom of degradation
}

export const DEFAULT_WEIGHTS: DriftWeights = {
  contextSaturation: 0.35,
  topicScatter: 0.04,
  uncertaintySignals: 0.02,
  repetition: 0.35,
  goalDistance: 0.08,
  confidenceDrift: 0.01,
  responseLengthCollapse: 0.15,
};

export interface DriftAnalysis {
  score: number;              // 0-100 weighted total
  level: DriftLevel;
  factors: DriftFactors;
  weights: DriftWeights;
  messageCount: number;
  sessionDuration: number;    // ms
  recommendations: string[];
  calculatedAt: number;       // timestamp
  // Optional detailed goal drift analysis (quartile checkpoints)
  goalDrift?: GoalDriftAnalysis;
}

// --- Goal Drift Analysis ---

export interface GoalCheckpoint {
  position: number;           // 0, 25, 50, 75, 100 (percentile)
  similarity: number;          // 0-1: TF-IDF cosine similarity to anchor
  driftScore: number;         // 0-100: (1 - similarity) * 140
}

export interface GoalDriftAnalysis {
  checkpoints: GoalCheckpoint[];
  trajectory: 'stable' | 'gradual_decline' | 'sharp_drop' | 'volatile' | 'recovery';
  averageScore: number;       // 0-100: mean drift across all checkpoints
  startToEndDrift: number;    // 0-100: drift from start → end specifically
}

// --- Session State ---

export interface SessionState {
  chatId: string;
  tabId: number;
  platform: Platform;
  title?: string;
  userGoal?: string;          // Optional: explicit goal set by user
  goalTimestamp?: number;     // When user set the goal
  messages: ChatMessage[];
  currentDrift: DriftAnalysis;
  startedAt: number;
  lastMessageAt: number;
}

export interface ChatSummary {
  chatId: string;
  platform: Platform;
  title?: string;
  messageCount: number;
  driftScore: number;
  driftLevel: DriftLevel;
  lastMessageAt: number;
}

// --- Chrome Message Passing ---

export type BGMessage =
  | { type: 'NEW_MESSAGE'; payload: ChatMessage }
  | { type: 'GET_SESSION'; payload: { chatId: string } }
  | { type: 'RESET_SESSION'; payload: { chatId: string } }
  | { type: 'GET_DRIFT'; payload: { chatId: string } }
  | { type: 'UPDATE_WEIGHTS'; payload: DriftWeights }
  | { type: 'GET_ALL_SESSIONS' }
  | { type: 'GET_CHAT_FOR_TAB'; payload: { tabId: number } }
  | { type: 'SET_GOAL'; payload: { chatId: string; goal: string } }
  | { type: 'CLEAR_GOAL'; payload: { chatId: string } };

export type BGResponse =
  | { type: 'SESSION'; payload: SessionState | null }
  | { type: 'DRIFT'; payload: DriftAnalysis }
  | { type: 'OK' }
  | { type: 'ERROR'; message: string }
  | { type: 'SESSION_LIST'; payload: ChatSummary[] }
  | { type: 'CHAT_ID'; payload: string | null };

// --- Drift Thresholds ---

export const DRIFT_THRESHOLDS = {
  fresh: { min: 0, max: 29 },
  warming: { min: 30, max: 60 },
  drifting: { min: 61, max: 80 },
  polluted: { min: 81, max: 100 },
} as const;

export const BADGE_COLORS: Record<DriftLevel, string> = {
  fresh: '#22c55e',
  warming: '#eab308',
  drifting: '#ef4444',
  polluted: '#1f2937',
};

// --- Utility ---

export function scoreToLevel(score: number): DriftLevel {
  if (score < 30) return 'fresh';
  if (score <= 60) return 'warming';
  if (score <= 80) return 'drifting';
  return 'polluted';
}
