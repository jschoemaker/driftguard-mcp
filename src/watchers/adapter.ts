import { ParsedMessage } from './claude-parser';

export type { ParsedMessage };

export interface ParserAdapter {
  /** Human-readable name shown in CLI/MCP output. */
  readonly name: string;
  /** Detect whether a file path looks like this adapter's format. */
  canParse(filePath: string): boolean;
  /** Parse the file into the shared ParsedMessage[] format. */
  parse(filePath: string): ParsedMessage[];
  /** Find the most recent session file for this adapter. */
  findLatest(): string | null;
}
