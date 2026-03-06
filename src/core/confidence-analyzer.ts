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
    'might', 'may', 'could be', 'appears to be', 'seems to be',
    'appears', 'seems', 'possibly', 'arguably', 'allegedly',
  ],

  // Adverbs of genuine uncertainty
  uncertainAdverbs: [
    'probably', 'likely', 'perhaps', 'maybe', 'approximately', 'roughly',
  ],

  // Epistemic markers (subjective speech)
  epistemicMarkers: [
    'I think', 'I believe', 'in my opinion', 'in my view',
    'it seems', 'it appears', 'I would say', 'I\'d say',
    'I\'m not sure', 'I\'m not certain', 'I\'m unsure',
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
 * Confidence drift score: measures whether hedging language is INCREASING
 * over the session (early vs late assistant messages). Absolute hedging level
 * is ignored — only the trend matters.
 */
export function calculateConfidenceDrift(messages: ChatMessage[]): number {
  return Math.min(100, trackConfidenceTrend(messages));
}
