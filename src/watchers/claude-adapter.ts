import { ParserAdapter, ParsedMessage } from './adapter';
import { parseJSONL, findLatestSession, findSessionByCwd } from './claude-parser';

export class ClaudeAdapter implements ParserAdapter {
  readonly name = 'claude';

  canParse(filePath: string): boolean {
    return filePath.includes('.claude') && filePath.endsWith('.jsonl');
  }

  parse(filePath: string): ParsedMessage[] {
    return parseJSONL(filePath);
  }

  findLatest(): string | null {
    return findSessionByCwd() ?? findLatestSession();
  }
}
