// ============================================================
// Topic Analyzer — TF-IDF Cosine Similarity
// ============================================================
// Measures topic entropy using TF-IDF vectors and cosine
// similarity between sliding windows. More accurate than
// simple keyword Jaccard — weights terms by importance.
// ============================================================

import { ChatMessage, GoalDriftAnalysis, GoalCheckpoint } from './types';

// ============================================================
// Public API
// ============================================================

/**
 * Calculate topic entropy score (0-100) using TF-IDF cosine similarity.
 * Higher = more scattered topics = higher drift risk.
 */
/** Maximum number of messages fed into topic entropy to prevent OOM on huge sessions. */
const TOPIC_ENTROPY_MSG_CAP = 150;

export function calculateTopicEntropy(messages: ChatMessage[]): number {
  if (messages.length < 3) return 0;

  // Cap to the most recent N messages to bound memory usage on very long sessions
  const capped = messages.length > TOPIC_ENTROPY_MSG_CAP
    ? messages.slice(-TOPIC_ENTROPY_MSG_CAP)
    : messages;

  const windows = createWindows(capped, 3);
  if (windows.length < 2) return 0;

  // Build TF-IDF from the corpus of windows
  const corpus = windows.map(w => w.join(' '));
  const tfidfVectors = buildTfidfVectors(corpus);

  // Consecutive window similarity
  const consecutiveSims: number[] = [];
  for (let i = 1; i < tfidfVectors.length; i++) {
    consecutiveSims.push(cosineSimilarity(tfidfVectors[i - 1], tfidfVectors[i]));
  }
  const avgConsecutive = consecutiveSims.reduce((a, b) => a + b, 0) / consecutiveSims.length;

  // Wide jumps — compare every 3rd window for macro-level drift
  const wideSims: number[] = [];
  for (let i = 3; i < tfidfVectors.length; i += 3) {
    wideSims.push(cosineSimilarity(tfidfVectors[i - 3], tfidfVectors[i]));
  }
  const avgWide = wideSims.length > 0
    ? wideSims.reduce((a, b) => a + b, 0) / wideSims.length
    : avgConsecutive;

  // Blend: 60% consecutive, 40% wide comparison
  const blendedSimilarity = avgConsecutive * 0.6 + avgWide * 0.4;

  const entropy = Math.round((1 - blendedSimilarity) * 100);
  return Math.min(100, Math.max(0, entropy));
}

/**
 * Calculate anchor drift score (0-100).
 * Measures how far the recent conversation has drifted from the
 * original user message (the "anchor" / goal).
 */
export function calculateAnchorDrift(messages: ChatMessage[], userGoal?: string): number {
  if (messages.length < 4) return 0;

  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) return 0;

  // Anchor = explicit user goal if set, otherwise first 1-2 user messages
  const anchorDoc = userGoal
    ? userGoal
    : userMessages.slice(0, Math.min(2, userMessages.length)).map(m => m.content).join(' ');

  // Recent = last 3 messages (current state of conversation)
  const recentMessages = messages.slice(-3);
  const recentDoc = recentMessages.map(m => m.content).join(' ');

  // Validate documents exist
  if (!anchorDoc.trim() || !recentDoc.trim()) return 0;

  // Build TF-IDF for just these two documents
  const corpus = [anchorDoc, recentDoc];
  const vectors = buildTfidfVectors(corpus);

  if (vectors.length < 2) return 0;

  const similarity = cosineSimilarity(vectors[0], vectors[1]);

  // Ensure similarity is a valid number
  if (typeof similarity !== 'number' || isNaN(similarity)) return 0;

  // Convert: high similarity = low drift, low similarity = high drift.
  // Conversations naturally diverge in vocabulary even on-topic, so we treat
  // similarity >= 0.5 as healthy (score 0). Score rises to 100 at similarity 0.
  const score = goalDriftScore(similarity);
  return Math.max(0, isNaN(score) ? 0 : score);
}

/**
 * Calculate goal drift with intermediate checkpoints.
 * Divides conversation into quartiles and measures drift at each checkpoint.
 * Returns trajectory (stable, gradual_decline, sharp_drop, volatile, recovery).
 */
export function calculateGoalDriftCheckpoints(
  messages: ChatMessage[],
  userGoal?: string,
): GoalDriftAnalysis {
  if (messages.length < 4) {
    return {
      checkpoints: [],
      trajectory: 'stable',
      averageScore: 0,
      startToEndDrift: 0,
    };
  }

  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length < 2) {
    return {
      checkpoints: [],
      trajectory: 'stable',
      averageScore: 0,
      startToEndDrift: 0,
    };
  }

  // Anchor = user's explicit goal, or first 1-2 user messages
  const anchorTexts = userGoal
    ? [userGoal]
    : userMessages.slice(0, Math.min(2, userMessages.length));
  const anchorDoc = Array.isArray(anchorTexts)
    ? anchorTexts.map(m => typeof m === 'string' ? m : m.content).join(' ')
    : anchorTexts;

  if (!anchorDoc.trim()) {
    return {
      checkpoints: [],
      trajectory: 'stable',
      averageScore: 0,
      startToEndDrift: 0,
    };
  }

  // Divide remaining messages into 5 windows: 0%, 25%, 50%, 75%, 100%
  const checkpoints: GoalCheckpoint[] = [];
  const positions = [0, 25, 50, 75, 100];

  // Build TF-IDF vectors once for efficiency
  // temporary map used in previous iterations; removed to eliminate unused variable

  for (const pos of positions) {
    const endIdx = Math.max(1, Math.floor((messages.length * pos) / 100));
    const windowMessages = messages.slice(0, endIdx);
    const windowDoc = windowMessages.map(m => m.content).join(' ');

    if (!windowDoc.trim()) {
      checkpoints.push({
        position: pos,
        similarity: 1,  // Empty window = same as anchor
        driftScore: 0,
      });
      continue;
    }

    // Calculate TF-IDF similarity
    const corpus = [anchorDoc, windowDoc];
    const vectors = buildTfidfVectors(corpus);

    if (vectors.length < 2) {
      checkpoints.push({
        position: pos,
        similarity: pos === 0 ? 1 : 0,
        driftScore: pos === 0 ? 0 : 100,
      });
      continue;
    }

    const similarity = cosineSimilarity(vectors[0], vectors[1]);
    const validSimilarity =
      typeof similarity === 'number' && !isNaN(similarity) ? similarity : 0;
    const driftScore = goalDriftScore(validSimilarity);

    checkpoints.push({
      position: pos,
      similarity: Math.max(0, Math.min(1, validSimilarity)),
      driftScore: Math.max(0, isNaN(driftScore) ? 0 : driftScore),
    });
  }

  // Detect trajectory pattern
  const scores = checkpoints.map(c => c.driftScore);
  const trajectory = detectTrajectory(scores);

  // Calculate average drift (excluding the first checkpoint which is always 0)
  const driftsAfterStart = scores.slice(1);
  const averageScore = driftsAfterStart.length
    ? Math.round(driftsAfterStart.reduce((a, b) => a + b, 0) / driftsAfterStart.length)
    : 0;

  // Start to end drift
  const startToEndDrift = checkpoints.length > 1
    ? checkpoints[checkpoints.length - 1].driftScore
    : 0;

  return {
    checkpoints,
    trajectory,
    averageScore,
    startToEndDrift,
  };
}

/**
 * Detect trajectory pattern from drift scores across checkpoints.
 */
function detectTrajectory(
  scores: number[],
): 'stable' | 'gradual_decline' | 'sharp_drop' | 'volatile' | 'recovery' {
  if (scores.length < 3) return 'stable';

  const changes: number[] = [];
  for (let i = 1; i < scores.length; i++) {
    changes.push(scores[i] - scores[i - 1]);
  }

  // Calculate statistics
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const volatility = Math.sqrt(
    changes.reduce((sum, c) => sum + (c - avgChange) ** 2, 0) / changes.length,
  );

  // Count direction changes
  const declineCount = changes.filter(c => c < 0).length;
  const increaseCount = changes.filter(c => c > 0).length;

  // Sharp drop: one or more very large negative changes (>20 points)
  const hasSharpDrop = changes.some(c => c < -20);

  // Gradual decline: consistent negative trend (at least 60% of changes are negative)
  // AND the average change is reliably negative
  const isGradualDecline = 
    declineCount >= changes.length * 0.6 && 
    avgChange < -3 &&
    !hasSharpDrop;

  // Recovery: starts high, dips in middle, ends lower than middle but trending up at end
  const isRecovery =
    scores[0] > 20 &&
    scores.some((s, i) => i > 0 && i < scores.length - 1 && s > scores[scores.length - 1] + 15) &&
    changes[changes.length - 1] > 0; // Trending up at the end

  // Volatile: high variance in changes (oscillates a lot)
  const isVolatile = volatility > 20 && increaseCount > 0 && declineCount > 0;

  if (hasSharpDrop) return 'sharp_drop';
  if (isGradualDecline) return 'gradual_decline';
  if (isRecovery) return 'recovery';
  if (isVolatile) return 'volatile';
  return 'stable';
}

/**
 * Extract keywords from text. Used by repetition detection.
 */
export function extractKeywords(text: string): Set<string> {
  return new Set(tokenize(text));
}

/**
 * Jaccard similarity between two sets: |A ∩ B| / |A ∪ B|.
 * Still used by repetition detection for keyword fingerprints.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

// ============================================================
// Goal Drift Scoring Curve
// ============================================================

/**
 * Convert cosine similarity to a 0-100 drift score.
 *
 * Similarity ≥ 0.5 → score 0  (healthy: vocabulary overlap is typical even on-topic)
 * Similarity = 0.25 → score 50 (moderate drift)
 * Similarity = 0   → score 100 (completely unrelated content)
 *
 * Linear from [0, 0.5] → [100, 0], clamped below.
 * This replaces the old rawDrift * 140 formula which saturated at similarity < 0.29,
 * causing on-topic conversations to score 100.
 */
function goalDriftScore(similarity: number): number {
  const HEALTHY_THRESHOLD = 0.5;
  const rawDrift = 1 - similarity;
  const normalized = Math.max(0, (rawDrift - (1 - HEALTHY_THRESHOLD)) / HEALTHY_THRESHOLD);
  return Math.round(Math.min(100, normalized * 100));
}

// ============================================================
// TF-IDF Engine
// ============================================================

type TfidfVector = Map<string, number>;

/**
 * Build TF-IDF vectors for a corpus of documents.
 * TF = term frequency in document / total terms in document
 * IDF = log(total documents / documents containing term)
 * TF-IDF = TF * IDF — high for terms important to a specific document.
 */
function buildTfidfVectors(corpus: string[]): TfidfVector[] {
  const n = corpus.length;
  if (n === 0) return [];

  // Tokenize each document
  const tokenized = corpus.map(doc => tokenize(doc));

  // Document frequency: how many documents contain each term
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    const unique = new Set(tokens);
    for (const term of unique) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  // Build TF-IDF vector for each document
  return tokenized.map(tokens => {
    const vector: TfidfVector = new Map();
    if (tokens.length === 0) return vector;

    // Term frequency (normalized by document length)
    const tf = new Map<string, number>();
    for (const term of tokens) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }

    for (const [term, count] of tf) {
      const termFreq = count / tokens.length;
      const docFreq = df.get(term) || 1;
      const idf = Math.log((n + 1) / (docFreq + 1)) + 1; // Smoothed IDF
      vector.set(term, termFreq * idf);
    }

    return vector;
  });
}

/**
 * Cosine similarity between two TF-IDF vectors.
 * cos(A, B) = (A · B) / (|A| * |B|)
 */
function cosineSimilarity(a: TfidfVector, b: TfidfVector): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, weightA] of a) {
    normA += weightA * weightA;
    const weightB = b.get(term);
    if (weightB !== undefined) {
      dotProduct += weightA * weightB;
    }
  }

  for (const [, weightB] of b) {
    normB += weightB * weightB;
  }

  // Ensure norms are non-negative (floating-point safety)
  normA = Math.max(0, normA);
  normB = Math.max(0, normB);

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  // Handle edge cases
  if (denominator === 0 || isNaN(denominator)) return 0;
  
  const result = dotProduct / denominator;
  
  // Clamp to [0, 1] range and ensure it's a valid number
  return isNaN(result) ? 0 : Math.max(0, Math.min(1, result));
}

// ============================================================
// Tokenizer
// ============================================================

/**
 * Tokenize text into meaningful terms.
 * Strips code blocks, removes stop words, filters short words.
 */
function tokenize(text: string): string[] {
  // Strip code blocks (analyzed separately by code consistency)
  const withoutCode = text.replace(/```[\s\S]*?```/g, ' ');

  return withoutCode
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * Create sliding windows of concatenated message texts.
 */
function createWindows(messages: ChatMessage[], windowSize: number): string[][] {
  const windows: string[][] = [];

  for (let i = 0; i <= messages.length - windowSize; i++) {
    const windowTexts = messages
      .slice(i, i + windowSize)
      .map(m => {
        const withoutCode = m.content.replace(/```[\s\S]*?```/g, ' ');
        return withoutCode
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length >= 4 && !STOP_WORDS.has(w));
      })
      .flat();

    windows.push(windowTexts);
  }

  return windows;
}

// ============================================================
// Topic term extraction (used by handoff prompt)
// ============================================================

/**
 * Return the top N most frequent meaningful terms across all messages.
 * Uses the same tokenizer (stop-word removal, min length 4) as topic entropy.
 * Useful for generating human-readable topic summaries in handoff prompts.
 */
export function extractTopTerms(messages: ChatMessage[], n: number = 5): string[] {
  const freq = new Map<string, number>();
  for (const msg of messages) {
    for (const term of tokenize(msg.content)) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term]) => term);
}

// ============================================================
// N-gram utilities (used by repetition detection)
// ============================================================

/**
 * Extract word-level N-grams from text.
 * Returns a set of trigram strings for Jaccard comparison.
 */
export function extractNgrams(text: string, n: number = 3): Set<string> {
  // Strip numeric-leading tokens (e.g. "150g", "90ml", "3tsp") so that
  // measurement quantities don't interrupt content-word n-gram sequences.
  const tokens = tokenize(text).filter(w => !/^\d/.test(w));
  if (tokens.length < n) return new Set();

  const ngrams = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.add(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

// ============================================================
// Flesch-Kincaid utilities (used by message decay)
// ============================================================

/**
 * Calculate Flesch-Kincaid Grade Level for a text.
 * Higher grade = more complex text. Used to detect when AI
 * responses become more generic/simplified over time.
 */
export function fleschKincaidGrade(text: string): number {
  const sentences = countSentences(text);
  const words = countWords(text);
  const syllables = countSyllables(text);

  if (sentences === 0 || words === 0) return 0;

  // FK Grade Level = 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(0, grade);
}

function countSentences(text: string): number {
  // Split on sentence-ending punctuation
  const matches = text.match(/[.!?]+/g);
  return Math.max(1, matches ? matches.length : 1);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  let total = 0;
  for (const word of words) {
    total += countWordSyllables(word);
  }
  return Math.max(1, total);
}

function countWordSyllables(word: string): number {
  // Strip non-alpha
  const clean = word.replace(/[^a-z]/g, '');
  if (clean.length <= 2) return 1;

  // Count vowel groups
  const vowelGroups = clean.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Silent e at end
  if (clean.endsWith('e') && count > 1) count--;
  // -le at end counts as syllable
  if (clean.endsWith('le') && clean.length > 2 && !/[aeiouy]/.test(clean[clean.length - 3])) count++;

  return Math.max(1, count);
}

// Common stop words to ignore (multi-language)
const STOP_WORDS = new Set([
  'about', 'after', 'also', 'been', 'before', 'being', 'between',
  'both', 'came', 'come', 'could', 'each', 'from', 'have', 'here',
  'herself', 'himself', 'into', 'just', 'like', 'make', 'many',
  'might', 'more', 'most', 'much', 'must', 'never', 'only', 'other',
  'over', 'said', 'same', 'should', 'since', 'some', 'still', 'such',
  'take', 'than', 'that', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'under', 'very', 'want', 'well',
  'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with',
  'would', 'your', 'does', 'done', 'doing', 'going', 'know', 'need',
  'please', 'really', 'right', 'sure', 'tell', 'thank', 'thanks',
  'that', 'think', 'though', 'using', 'want', 'work', 'yeah',
  'actually', 'already', 'always', 'another', 'anything', 'around',
  'because', 'better', 'called', 'cannot', 'didnt', 'doesnt',
  'dont', 'enough', 'every', 'example', 'first', 'getting',
  'given', 'gonna', 'great', 'hasnt', 'helps', 'heres',
  'however', 'instead', 'keep', 'looking', 'means', 'maybe',
  'nothing', 'people', 'point', 'probably', 'something', 'sorry',
  'start', 'still', 'things', 'trying', 'understand', 'used',
  'without', 'youre',
  // Chat-speak
  'therre', 'thnx', 'thanx', 'wanna', 'kinda', 'gotta', 'lemme',
  'soooo', 'sooo', 'okayy', 'yeahh', 'nope', 'yep',
  // Generic non-informative tech words
  'file', 'code', 'function', 'variable', 'method', 'class',
  'type', 'value', 'data', 'list', 'array', 'object', 'string',
  'number', 'return', 'output', 'input', 'result',
  'issue', 'problem', 'question', 'answer', 'approach', 'solution',
  'basically', 'stuff', 'thing', 'part', 'case', 'line', 'step',
  // Dutch
  'deze', 'voor', 'maar', 'ook', 'zijn', 'niet', 'meer', 'naar',
  'hier', 'goed', 'heel', 'hoe', 'als', 'dan', 'alle', 'veel',
  'omdat', 'welke', 'weten', 'alleen', 'iets', 'andere', 'zonder',
  'hebben', 'wordt', 'kunnen', 'moeten', 'willen', 'zouden', 'eigenlijk',
  'misschien', 'graag', 'bedankt', 'prima', 'klopt', 'precies',
  // German
  'aber', 'auch', 'dein', 'denn', 'doch', 'durch', 'eine', 'ganz',
  'gern', 'hier', 'jede', 'kann', 'mehr', 'nach', 'noch', 'ohne',
  'oder', 'sein', 'sich', 'über', 'unter', 'viel', 'weil', 'wenn',
  'wird', 'diese', 'haben', 'jetzt', 'muss', 'nicht', 'sehr',
  'danke', 'bitte', 'genau', 'vielleicht', 'eigentlich', 'bestimmt',
  // French
  'aussi', 'avec', 'bien', 'cette', 'dans', 'elle', 'être', 'fait',
  'mais', 'même', 'nous', 'pour', 'sans', 'sont', 'tout', 'très',
  'vous', 'après', 'autre', 'avant', 'avoir', 'comme', 'encore',
  'entre', 'faire', 'leurs', 'merci', 'notre', 'parce', 'plus',
  'quand', 'quel', 'sera', 'tous', 'votre', 'donc', 'peut',
  // Spanish
  'algo', 'antes', 'bien', 'cada', 'como', 'cual', 'desde', 'donde',
  'esta', 'esto', 'hace', 'hasta', 'luego', 'mejor', 'mismo', 'mucho',
  'nada', 'otro', 'para', 'pero', 'poco', 'puede', 'sino', 'solo',
  'también', 'tiene', 'todo', 'todos', 'usted', 'sobre', 'gracias',
  'bueno', 'creo', 'ahora', 'entonces', 'realmente', 'bastante',
  // Portuguese
  'agora', 'algo', 'antes', 'cada', 'como', 'desde', 'esta', 'isso',
  'mais', 'muito', 'nada', 'onde', 'para', 'pode', 'qual', 'quando',
  'quem', 'será', 'seus', 'sobre', 'também', 'tudo', 'você',
  'obrigado', 'obrigada', 'acho', 'então', 'realmente', 'bastante',
]);
