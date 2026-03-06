// ============================================================
// DriftCalculator — Core Algorithm
// ============================================================
// Calculates a 0-100 DriftScore based on heuristic analysis
// of an AI chat session. No AI needed — pure math.
//
// v2: TF-IDF topic entropy, 3-gram repetition detection,
//     Flesch-Kincaid readability in message decay,
//     anchor drift (goal distance) as 7th factor.
// ============================================================

import {
  ChatMessage,
  DriftAnalysis,
  DriftFactors,
  DriftWeights,
  DEFAULT_WEIGHTS,
  scoreToLevel,
} from './types';
import {
  calculateTopicEntropy,
  calculateAnchorDrift,
  extractNgrams,
  fleschKincaidGrade,
  calculateGoalDriftCheckpoints,
} from './topic-analyzer';
import { countContradictions } from './contradiction-detector';
import { calculateConfidenceDrift } from './confidence-analyzer';

/**
 * Main entry point. Analyzes a list of messages and returns a DriftAnalysis.
 */
export function calculateDrift(
  messages: ChatMessage[],
  weights: DriftWeights = DEFAULT_WEIGHTS,
  userGoal?: string,
): DriftAnalysis {
  if (messages.length === 0) {
    return emptyAnalysis(weights);
  }

  // Ensure messages are analyzed in chronological order by timestamp.
  // Some content scripts may emit messages out-of-order; sorting here
  // makes the calculation robust regardless of insertion order.
  messages = messages.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  // Warn if timestamps are non-monotonic (possible clock skew or corrupted JSONL).
  for (let i = 1; i < messages.length; i++) {
    if ((messages[i].timestamp || 0) < (messages[i - 1].timestamp || 0)) {
      console.warn('[driftcli] Non-monotonic timestamps detected after sort — possible clock skew or corrupted session file');
      break;
    }
  }

  const factors: DriftFactors = {
    contextSaturation: calcMessageDecay(messages),
    topicScatter: calculateTopicEntropy(messages),
    uncertaintySignals: calcContradictionScore(messages),
    codeInconsistency: calcCodeInconsistency(messages),
    repetition: calcRepetition(messages),
    goalDistance: calculateAnchorDrift(messages, userGoal),
    confidenceDrift: calculateConfidenceDrift(messages),
  };

  const score = Math.min(100, Math.max(0, Math.round(
    factors.contextSaturation * weights.contextSaturation +
    factors.topicScatter * weights.topicScatter +
    factors.uncertaintySignals * weights.uncertaintySignals +
    factors.codeInconsistency * weights.codeInconsistency +
    factors.repetition * weights.repetition +
    factors.goalDistance * weights.goalDistance +
    factors.confidenceDrift * weights.confidenceDrift
  )));

  const level = scoreToLevel(score);
  const sessionDuration = messages[messages.length - 1].timestamp - messages[0].timestamp;

  // compute goal drift analysis if we have enough messages
  const goalDrift = calculateGoalDriftCheckpoints(messages, userGoal);

  return {
    score,
    level,
    factors,
    weights,
    messageCount: messages.length,
    sessionDuration,
    recommendations: generateRecommendations(score, factors),
    calculatedAt: Date.now(),
    goalDrift,
  };
}


// ============================================================
// Factor Calculators
// ============================================================

/**
 * Message Decay: token-based conversation depth + readability decay.
 * Estimates total tokens from word count, with a code block multiplier.
 * Flesch-Kincaid readability is tracked: if assistant responses become
 * significantly simpler over time, it signals context degradation
 * (the model falls back to generic, simplified answers).
 */
function calcMessageDecay(messages: ChatMessage[]): number {
  let totalTokens = 0;

  // Use exact API input token count when available (e.g. Gemini provides tokens.input).
  // Take the latest value — it represents the cumulative context size at that turn.
  const latestInputTokens = [...messages]
    .reverse()
    .find(m => (m.inputTokens ?? 0) > 0)
    ?.inputTokens;

  if (latestInputTokens !== undefined) {
    totalTokens = latestInputTokens;
  } else {
    for (const msg of messages) {
      const words = msg.content.split(/\s+/).filter(w => w.length > 0).length;
      const hasCode = msg.content.includes('```');
      const tokenEstimate = Math.round(words * 1.3 * (hasCode ? 1.5 : 1));
      totalTokens += tokenEstimate + (msg.toolTokens ?? 0);
    }
  }

  if (totalTokens < 500) return 0;

  let score = Math.min(100, Math.round(15 * Math.log(totalTokens / 1500)));
  if (score < 0) score = 0;

  // Message count bonus for rapid-fire conversations
  if (messages.length > 50) score += 10;
  else if (messages.length > 25) score += 5;

  // Flesch-Kincaid readability decay bonus
  // Compare early vs late assistant messages — if readability drops
  // significantly, the AI is producing simpler/more generic responses
  const readabilityPenalty = calcReadabilityDecay(messages);
  score += readabilityPenalty;

  return Math.min(100, score);
}

/**
 * Readability decay: compare Flesch-Kincaid grade of early vs late
 * assistant responses. A drop in grade level signals the model is
 * producing simpler, more generic text (context degradation).
 * Returns 0-15 bonus points for message decay.
 */
function calcReadabilityDecay(messages: ChatMessage[]): number {
  const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content.length > 50);
  if (assistantMsgs.length < 4) return 0;

  const quarter = Math.max(2, Math.floor(assistantMsgs.length / 4));
  const earlyMsgs = assistantMsgs.slice(0, quarter);
  const lateMsgs = assistantMsgs.slice(-quarter);

  const earlyGrade = earlyMsgs.reduce((sum, m) => sum + fleschKincaidGrade(m.content), 0) / earlyMsgs.length;
  const lateGrade = lateMsgs.reduce((sum, m) => sum + fleschKincaidGrade(m.content), 0) / lateMsgs.length;

  // If late responses are 2+ grade levels simpler → readability decay
  const drop = earlyGrade - lateGrade;
  if (drop < 2) return 0;
  if (drop < 4) return 5;
  if (drop < 6) return 10;
  return 15;
}

/**
 * Contradiction Score: based on AI self-correction patterns.
 */
function calcContradictionScore(messages: ChatMessage[]): number {
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length === 0) return 0;

  const totalContradictions = countContradictions(assistantMessages);

  // Normalize: 0 contradictions = 0, 5+ = 80-100
  const score = Math.min(100, (totalContradictions / 5) * 80);
  return Math.round(score);
}

/**
 * Code Inconsistency: detects language/framework switches in coding sessions.
 */
function calcCodeInconsistency(messages: ChatMessage[]): number {
  const codeBlocks = extractCodeBlocks(messages);
  if (codeBlocks.length < 2) return 0;

  const languages = new Set(
    codeBlocks.map(b => b.language).filter(l => l !== 'unknown'),
  );
  if (languages.size <= 1) return 0;

  // Gradual scale: 2 langs = 35, 3 = 55, 4 = 75, 5+ = 95-100
  const score = Math.min(100, Math.round(15 + (languages.size - 1) * 20));
  return score;
}

/**
 * Repetition Detection: sliding-window 4-gram novelty rate.
 *
 * For each assistant message (starting after a warm-up window), measures
 * what fraction of its 4-grams already appeared in the previous WINDOW
 * messages. Scores based on the recency-weighted average of these rates.
 *
 * This avoids the O(n²) accumulator problem of all-pairs comparison and
 * doesn't inflate with conversation length.
 *
 * Code block similarity is kept as an independent secondary signal — repeated
 * code is a strong, specific indicator the model is recycling its own output.
 */
function calcRepetition(messages: ChatMessage[]): number {
  if (messages.length < 8) return 0;

  const assistantMsgs = messages
    .filter(m => m.role === 'assistant')
    .slice(-25);

  //console.debug(
  //  `[DriftGuard] calcRepetition: totalMsgs=${messages.length} assistantMsgs=${assistantMsgs.length}`,
  //);

  if (assistantMsgs.length < 4) return 0;

  const WINDOW = 4;
  const repetitionRates: number[] = [];

  // 3-grams survive paraphrasing better than 4-grams: shorter sequences still
  // match even when the AI inserts qualifiers or reorders words slightly.
  // Start at index 3 so detection fires with 4 assistant messages.
  // Early iterations use whatever messages are available (up to WINDOW back).
  for (let i = 3; i < assistantMsgs.length; i++) {
    const current = extractNgrams(assistantMsgs[i].content, 3);
    if (current.size < 3) continue;

    // Build pool of 3-grams from the previous WINDOW messages (or fewer if early)
    const pool = new Set<string>();
    for (let j = Math.max(0, i - WINDOW); j < i; j++) {
      for (const gram of extractNgrams(assistantMsgs[j].content, 3)) {
        pool.add(gram);
      }
    }

    let repeated = 0;
    for (const gram of current) {
      if (pool.has(gram)) repeated++;
    }
    const rate = repeated / current.size;
   // console.debug(
     // `[DriftGuard] calcRepetition: assistantMsg[${i}] trigrams=${current.size} poolSize=${pool.size} repeated=${repeated} rate=${rate.toFixed(3)}`,
    //);
    repetitionRates.push(rate);
  }

  // Code block similarity — strong independent signal
  let codeScore = 0;
  const codeBlocksByMsg: string[][] = assistantMsgs.map(m => {
    return [...m.content.matchAll(/```\w*\n([\s\S]*?)```/g)]
      .map(match => match[1].replace(/\s+/g, ' ').trim());
  });

  for (let i = 0; i < codeBlocksByMsg.length; i++) {
    for (let j = i + 2; j < Math.min(codeBlocksByMsg.length, i + WINDOW + 1); j++) {
      for (const blockA of codeBlocksByMsg[i]) {
        if (blockA.length < 20) continue;
        for (const blockB of codeBlocksByMsg[j]) {
          if (blockB.length < 20) continue;
          if (charSimilarity(blockA, blockB) > 0.8) codeScore += 25;
        }
      }
    }
  }

  if (repetitionRates.length === 0) return Math.min(100, codeScore);

  // Recency-weighted average: later scores count more
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < repetitionRates.length; i++) {
    const w = i + 1;
    weightedSum += repetitionRates[i] * w;
    totalWeight += w;
  }
  const avgRate = weightedSum / totalWeight;

  // Score mapping: <0.15 = healthy noise, 0.15-0.35 = mild, 0.35-0.6 = significant, 0.6+ = heavy
  let textScore = 0;
  if (avgRate >= 0.60) {
    textScore = Math.round(80 + Math.min(20, ((avgRate - 0.60) / 0.40) * 20));
  } else if (avgRate >= 0.35) {
    textScore = Math.round(40 + ((avgRate - 0.35) / 0.25) * 40);
  } else if (avgRate >= 0.15) {
    textScore = Math.round(((avgRate - 0.15) / 0.20) * 40);
  }

  const finalScore = Math.min(100, textScore + codeScore);
  //console.debug(
    //`[DriftGuard] calcRepetition: avgRate=${avgRate.toFixed(3)} textScore=${textScore} codeScore=${codeScore} finalScore=${finalScore}`,
  //);
  return finalScore;
}

/**
 * Content similarity using bigram overlap + positional matching.
 */
function charSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  if (a === b) return 1;

  // Positional character matching
  let positionalMatches = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) positionalMatches++;
  }
  const positionalScore = positionalMatches / maxLen;

  // Bigram overlap
  const bigramsA = new Map<string, number>();
  const bigramsB = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    bigramsB.set(bg, (bigramsB.get(bg) || 0) + 1);
  }

  let intersection = 0;
  let union = 0;
  const allBigrams = new Set([...bigramsA.keys(), ...bigramsB.keys()]);
  for (const bg of allBigrams) {
    const countA = bigramsA.get(bg) || 0;
    const countB = bigramsB.get(bg) || 0;
    intersection += Math.min(countA, countB);
    union += Math.max(countA, countB);
  }
  const bigramScore = union === 0 ? 1 : intersection / union;

  return Math.max(positionalScore, bigramScore);
}

// ============================================================
// Helpers
// ============================================================

interface CodeBlock {
  language: string;
  content: string;
}

function extractCodeBlocks(messages: ChatMessage[]): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  for (const msg of messages) {
    for (const match of msg.content.matchAll(/```(\w*)\n([\s\S]*?)```/g)) {
      const language = detectLanguage(match[1], match[2]);
      blocks.push({ language, content: match[2] });
    }
  }

  return blocks;
}

function detectLanguage(label: string, content: string): string {
  if (label) return label.toLowerCase();

  if (content.includes('import React') || content.includes('useState')) return 'jsx';
  if (content.includes('def ') && content.includes(':')) return 'python';
  if (content.includes('func ') && content.includes('{')) return 'go';
  if (content.includes('fn ') && content.includes('->')) return 'rust';
  if (content.includes('function') || content.includes('const ')) return 'javascript';
  return 'unknown';
}

function generateRecommendations(score: number, factors: DriftFactors): string[] {
  const recs: string[] = [];

  if (score <= 30) {
    recs.push('Context is clean — carry on!');
    return recs;
  }

  if (factors.contextSaturation > 50) {
    recs.push('Long conversation — consider starting fresh with a summary of key decisions.');
  }
  if (factors.topicScatter > 50) {
    recs.push('Multiple topics detected — try to keep one topic per conversation.');
  }
  if (factors.uncertaintySignals > 40) {
    recs.push('AI is self-correcting frequently — context may be confused. Re-state your requirements.');
  }
  if (factors.codeInconsistency > 30) {
    recs.push('Multiple languages/frameworks in one chat — start a new chat for each tech stack.');
  }
  if (factors.repetition > 30) {
    recs.push('AI is repeating itself — context is degrading. Start a new conversation.');
  }
  if (factors.goalDistance > 50) {
    recs.push('Conversation has drifted far from your original goal. Re-anchor or start fresh.');
  }
  if (factors.confidenceDrift > 40) {
    recs.push('AI confidence is declining — context may be becoming unreliable. Verify assumptions.');
  }

  if (score > 80) {
    recs.push('Strongly recommend starting a new conversation. Copy your key context first.');
  }

  return recs;
}

function emptyAnalysis(weights: DriftWeights): DriftAnalysis {
  return {
    score: 0,
    level: 'fresh',
    factors: {
      contextSaturation: 0,
      topicScatter: 0,
      uncertaintySignals: 0,
      codeInconsistency: 0,
      repetition: 0,
      goalDistance: 0,
      confidenceDrift: 0,
    },
    weights,
    messageCount: 0,
    sessionDuration: 0,
    recommendations: ['No messages yet.'],
    calculatedAt: Date.now(),
    goalDrift: {
      checkpoints: [],
      trajectory: 'stable',
      averageScore: 0,
      startToEndDrift: 0,
    },
  };
}
