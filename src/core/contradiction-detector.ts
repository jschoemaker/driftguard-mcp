// ============================================================
// Contradiction Detector — Heuristic Self-Correction Detection
// ============================================================
// Detects patterns where the AI is correcting itself, which
// indicates context confusion or hallucination recovery.
// ============================================================

import { ChatMessage } from './types';

/**
 * Count contradiction/self-correction signals in assistant messages.
 * Returns a raw count of detected patterns.
 */
export function countContradictions(assistantMessages: ChatMessage[]): number {
  let count = 0;

  for (let i = 0; i < assistantMessages.length; i++) {
    const msg = assistantMessages[i];
    const text = msg.content.toLowerCase();

    // Direct self-correction patterns
    count += countPatternMatches(text, CORRECTION_PATTERNS);

    // Compare with previous assistant message for reversals
    if (i > 0) {
      const prevText = assistantMessages[i - 1].content.toLowerCase();
      count += detectReversals(prevText, text);
    }
  }

  return count;
}

/**
 * Count how many correction patterns appear in the text.
 */
function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Detect when the AI reverses a previous statement.
 * E.g., "you should use X" followed by "don't use X"
 */
function detectReversals(prevText: string, currentText: string): number {
  let reversals = 0;

  // Check for reversal signals: "actually" or correction phrases + negation
  const hasReversalSignal = currentText.includes('actually') ||
    currentText.includes('however') ||
    currentText.includes('but ') ||
    currentText.includes('instead') ||
    // Dutch
    currentText.includes('eigenlijk') ||
    currentText.includes('echter') ||
    currentText.includes('maar ') ||
    // German
    currentText.includes('eigentlich') ||
    currentText.includes('allerdings') ||
    currentText.includes('aber ') ||
    currentText.includes('stattdessen') ||
    // French
    currentText.includes('en fait') ||
    currentText.includes('cependant') ||
    currentText.includes('mais ') ||
    currentText.includes('plutôt') ||
    // Spanish
    currentText.includes('en realidad') ||
    currentText.includes('sin embargo') ||
    currentText.includes('pero ') ||
    currentText.includes('en cambio') ||
    // Portuguese
    currentText.includes('na verdade') ||
    currentText.includes('no entanto') ||
    currentText.includes('mas ') ||
    currentText.includes('em vez');

  if (hasReversalSignal) {
    for (const negation of NEGATION_PAIRS) {
      if (
        prevText.includes(negation.positive) &&
        currentText.includes(negation.negative)
      ) {
        reversals++;
      }
    }
  }

  return reversals;
}

// Patterns that indicate the AI is correcting itself
const CORRECTION_PATTERNS: RegExp[] = [
  // English — explicit corrections
  /i apologize/gi,
  /i was (?:wrong|mistaken|incorrect)/gi,
  /let me correct/gi,
  /let me (?:re-?do|re-?write|re-?phrase|fix) that/gi,
  /i (?:need to|should) clarify/gi,
  /upon (?:further )?(?:review|reflection|consideration)/gi,
  /i previously (?:said|mentioned|stated|suggested)/gi,
  /(?:ignore|disregard) (?:my |what i )(?:previous|earlier)/gi,
  /i made (?:a |an )?(?:error|mistake)/gi,
  /correction:/gi,
  /wait[,.]? (?:that's|i|let me)/gi,
  /actually[,.]? (?:that|i was|you're right|the|no)/gi,
  /you'?re (?:right|correct)[,.]? (?:i|let|my|the)/gi,
  /my (?:earlier|previous) (?:response|answer|suggestion) was/gi,
  /i (?:over|under)(?:looked|estimated|stated)/gi,
  /sorry[,.]? (?:i|that|for|about|let)/gi,
  /i (?:should have|shouldn't have|misspoke)/gi,
  /(?:good|fair) point[,.]? (?:i|let|you)/gi,
  /i stand corrected/gi,
  /to clarify (?:my|what|the)/gi,
  /(?:that|this) (?:is|was) (?:not )?(?:quite )?(?:right|correct|accurate)/gi,
  /i (?:incorrectly|mistakenly) (?:said|stated|suggested|assumed)/gi,
  /my (?:bad|apologies|mistake)/gi,
  /i (?:was |)(?:confused|confusing)/gi,
  /(?:let me|i'll) (?:start over|rethink|reconsider)/gi,
  // Dutch — self-correction patterns
  /(?:sorry|excuses)[,.]? (?:ik|dat|voor)/gi,
  /ik had (?:het |)(?:fout|mis|verkeerd)/gi,
  /laat me (?:dat |het |)(?:corrigeren|verbeteren|herstellen)/gi,
  /dat (?:klopt|klopte) (?:niet|eigenlijk niet)/gi,
  /ik (?:bedoelde|bedoel) eigenlijk/gi,
  /bij nader inzien/gi,
  /mijn fout/gi,
  // German — self-correction patterns
  /(?:entschuldigung|tut mir leid)[,.]? (?:ich|das|für)/gi,
  /ich (?:war|lag) (?:falsch|daneben)/gi,
  /lass mich (?:das |)(?:korrigieren|berichtigen|richtigstellen)/gi,
  /das (?:stimmt|stimmte) (?:nicht|so nicht)/gi,
  /ich (?:meinte|meine) eigentlich/gi,
  /bei näherer betrachtung/gi,
  /mein fehler/gi,
  /ich muss mich korrigieren/gi,
  /ich habe mich (?:geirrt|vertan|getäuscht)/gi,
  // French — self-correction patterns
  /(?:je m'excuse|pardon|désolé)[,.]? (?:je|c'|pour)/gi,
  /j'(?:avais|ai) (?:tort|fait une erreur)/gi,
  /laissez-moi (?:corriger|rectifier)/gi,
  /(?:c'est|c'était) (?:pas correct|inexact|une erreur)/gi,
  /en fait[,.]? (?:c'est|je|il|non)/gi,
  /après (?:réflexion|vérification)/gi,
  /mon erreur/gi,
  /je (?:me suis trompé|dois rectifier)/gi,
  // Spanish — self-correction patterns
  /(?:perdón|disculpa|lo siento)[,.]? (?:yo|eso|por)/gi,
  /(?:estaba|estuve) (?:equivocado|mal|incorrecto)/gi,
  /(?:déjame|permíteme) (?:corregir|rectificar)/gi,
  /(?:eso|esto) (?:no es|no era) (?:correcto|exacto)/gi,
  /en realidad[,.]? (?:es|yo|no|el)/gi,
  /pensándolo (?:bien|mejor)/gi,
  /mi error/gi,
  /me (?:equivoqué|confundí)/gi,
  // Portuguese — self-correction patterns
  /(?:desculpe?|perdão)[,.]? (?:eu|isso|por)/gi,
  /eu (?:estava|estive) (?:errado|equivocado|enganado)/gi,
  /(?:deixe-me|permita-me) (?:corrigir|retificar)/gi,
  /(?:isso|isto) (?:não é|não estava) (?:correto|certo)/gi,
  /na verdade[,.]? (?:é|eu|não|o)/gi,
  /pensando (?:bem|melhor)/gi,
  /meu erro/gi,
  /eu (?:me enganei|me confundi|errei)/gi,
];

// Pairs of positive/negative statements that indicate reversal
const NEGATION_PAIRS = [
  // English
  { positive: 'you should', negative: "you shouldn't" },
  { positive: 'you should', negative: 'you should not' },
  { positive: 'recommend', negative: "don't recommend" },
  { positive: 'recommend', negative: 'do not recommend' },
  { positive: 'best practice', negative: 'not.+best practice' },
  { positive: 'you can', negative: "you can't" },
  { positive: 'you can', negative: 'you cannot' },
  { positive: 'safe to', negative: 'not safe to' },
  { positive: 'correct', negative: 'incorrect' },
  // Dutch
  { positive: 'je moet', negative: 'je moet niet' },
  { positive: 'je kunt', negative: 'je kunt niet' },
  { positive: 'aanbevolen', negative: 'niet aanbevolen' },
  { positive: 'veilig', negative: 'niet veilig' },
  // German
  { positive: 'du solltest', negative: 'du solltest nicht' },
  { positive: 'du kannst', negative: 'du kannst nicht' },
  { positive: 'empfohlen', negative: 'nicht empfohlen' },
  { positive: 'sicher', negative: 'nicht sicher' },
  // French
  { positive: 'vous devriez', negative: 'vous ne devriez pas' },
  { positive: 'vous pouvez', negative: 'vous ne pouvez pas' },
  { positive: 'recommandé', negative: 'pas recommandé' },
  { positive: 'correct', negative: 'pas correct' },
  // Spanish
  { positive: 'deberías', negative: 'no deberías' },
  { positive: 'puedes', negative: 'no puedes' },
  { positive: 'recomendado', negative: 'no recomendado' },
  { positive: 'seguro', negative: 'no es seguro' },
  // Portuguese
  { positive: 'você deveria', negative: 'você não deveria' },
  { positive: 'você pode', negative: 'você não pode' },
  { positive: 'recomendado', negative: 'não recomendado' },
  { positive: 'seguro', negative: 'não é seguro' },
];
