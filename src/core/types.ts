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
  contextSaturation: number;  // 0-100: token depth + readability (Flesch-Kincaid)
  topicScatter: number;       // 0-100: topic fragmentation (TF-IDF cosine similarity)
  uncertaintySignals: number; // 0-100: self-correction & hedging language
  codeInconsistency: number;  // 0-100: language/framework switches
  repetition: number;         // 0-100: repeated content (3-gram + keyword Jaccard)
  goalDistance: number;       // 0-100: semantic distance from original goal
  confidenceDrift: number;    // 0-100: confidence degradation over time (hedging trend)
}

export interface DriftWeights {
  contextSaturation: number;  // default 0.20: context depth saturation (Lost in the Middle)
  topicScatter: number;       // default 0.12: topic fragmentation
  uncertaintySignals: number; // default 0.15: uncertainty indicators (Kadavath et al.)
  codeInconsistency: number;  // default 0.08: code language switching
  repetition: number;         // default 0.20: content repetition (Holtzman et al.)
  goalDistance: number;       // default 0.15: distance from original goal
  confidenceDrift: number;    // default 0.10: confidence degradation trend
}

export const DEFAULT_WEIGHTS: DriftWeights = {
  contextSaturation: 0.20,
  topicScatter: 0.12,
  uncertaintySignals: 0.15,
  codeInconsistency: 0.08,
  repetition: 0.20,
  goalDistance: 0.15,
  confidenceDrift: 0.10,
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
