// ============================================================
// Confidence Analyzer — Detect Hedging & Uncertainty Patterns
// ============================================================
// Analyzes assistant responses for hedging language, epistemic
// markers, and confidence drift over time. High hedging + declining
// trend = confidence drift.
// ============================================================

import { ChatMessage } from './types';

/**
 * Hedging language patterns: words/phrases that signal uncertainty.
 * Categorized by type of hedging.
 */
const HEDGING_PATTERNS = {
  // Modal verbs + uncertainty
  modalUncertainty: [
    'might', 'may', 'could', 'could be', 'appears to be', 'seems to be',
    'appears', 'seems', 'possibly', 'arguably', 'allegedly',
  ],

  // Adverbs of uncertainty
  uncertainAdverbs: [
    'probably', 'likely', 'perhaps', 'maybe', 'somewhat', 'relatively',
    'quite', 'fairly', 'rather', 'approximately', 'roughly', 'sort of',
    'kind of', 'a bit', 'a little',
  ],

  // Epistemic markers (subjective speech)
  epistemicMarkers: [
    'I think', 'I believe', 'in my opinion', 'in my view',
    'it seems', 'it appears', 'I would say', 'I\'d say',
  ],

  // Downgraders (reduce force of statement)
  downgraders: [
    'just', 'only', 'merely', 'simply', 'barely', 'scarcely',
    'somewhat', 'not quite', 'not entirely', 'not fully',
  ],

  // Negation reversals (contradicting prior claims)
  negationPatterns: [
    'actually', 'wait', 'hold on', 'correction', 'let me correct',
    'upon reflection', 'on second thought', 'rethinking', 'mistake',
    'I was wrong', 'I apologize', 'I retract',
  ],
};

/**
 * Detects hedging language in a single message.
 * Returns a score 0-100 indicating how much hedging is present.
 */
export function detectHedgingLanguage(messageContent: string): number {
  if (!messageContent || messageContent.length < 10) return 0;

  const lower = messageContent.toLowerCase();
  let hedgingCount = 0;
  let totalRelevantWords = 0;

  // Count hedging patterns
  for (const patterns of Object.values(HEDGING_PATTERNS)) {
    for (const pattern of patterns) {
      // Use word boundaries to avoid partial matches
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      const matches = lower.match(regex);
      if (matches) {
        hedgingCount += matches.length;
      }
    }
  }

  // Count total words (rough estimate for ratio)
  const words = lower.split(/\s+/).filter(w => w.length > 2).length;
  totalRelevantWords = Math.max(words, 1);

  // Normalize to 0-100
  const hedgingRatio = hedgingCount / totalRelevantWords;
  return Math.min(100, Math.round(hedgingRatio * 200)); // Scale up for visibility
}

/**
 * Tracks confidence trend across assistant responses.
 * Returns 0-100 score indicating if confidence is declining.
 */
export function trackConfidenceTrend(messages: ChatMessage[]): number {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length < 2) return 0;

  // Calculate hedging scores for early and late messages
  const earlyMessages = assistantMessages.slice(0, Math.ceil(assistantMessages.length / 3));
  const lateMessages = assistantMessages.slice(Math.floor(assistantMessages.length * 2 / 3));

  const earlyAvg = earlyMessages.reduce((sum, m) => sum + detectHedgingLanguage(m.content), 0) / earlyMessages.length;
  const lateAvg = lateMessages.reduce((sum, m) => sum + detectHedgingLanguage(m.content), 0) / lateMessages.length;

  // If late messages are more hedged, confidence is declining
  const trendScore = Math.max(0, lateAvg - earlyAvg);
  return Math.round(trendScore);
}

/**
 * Detects negation reversals — assistant contradicting itself with
 * explicit corrections ("actually", "I was wrong", etc.).
 * Returns 0-100 indicating frequency and severity.
 */
export function detectNegationReversals(messages: ChatMessage[]): number {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length < 2) return 0;

  let reversalCount = 0;

  // Look for reversal patterns in each message
  for (const msg of assistantMessages) {
    const lower = msg.content.toLowerCase();
    for (const pattern of HEDGING_PATTERNS.negationPatterns) {
      const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
      if (regex.test(lower)) {
        reversalCount += 1;
        break; // Count per message, not per pattern occurrence
      }
    }
  }

  // Normalize: each reversal is 5 points per message
  const baseScore = (reversalCount / assistantMessages.length) * 50;
  // Bonus if reversals are later in conversation (shows growing confusion)
  const lateReversals = assistantMessages.slice(-Math.ceil(assistantMessages.length / 3));
  const lateReversalCount = lateReversals.filter(m => {
    const lower = m.content.toLowerCase();
    return HEDGING_PATTERNS.negationPatterns.some(p => new RegExp(`\\b${p}\\b`, 'i').test(lower));
  }).length;

  const lateBonus = (lateReversalCount / Math.max(lateReversals.length, 1)) * 30;

  return Math.min(100, Math.round(baseScore + lateBonus));
}

/**
 * Composite confidence drift score combining all metrics.
 * Returns 0-100 indicating overall decline in assistant confidence.
 */
export function calculateConfidenceDrift(messages: ChatMessage[]): number {
  if (messages.length < 2) return 0;

  const hedgingScore = messages
    .filter(m => m.role === 'assistant')
    .reduce((sum, m) => sum + detectHedgingLanguage(m.content), 0) /
    Math.max(messages.filter(m => m.role === 'assistant').length, 1);

  const trendScore = trackConfidenceTrend(messages);
  const reversalScore = detectNegationReversals(messages);

  // Weighted combination: hedging base (40%), trend (35%), reversals (25%)
  const composite = Math.round(
    hedgingScore * 0.40 +
    trendScore * 0.35 +
    reversalScore * 0.25
  );

  return Math.min(100, composite);
}
