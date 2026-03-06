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
  for (const msg of assistantMessages) {
    count += countPatternMatches(msg.content.toLowerCase(), CORRECTION_PATTERNS);
  }
  return count;
}

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
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

