/**
 * Ports: the interfaces the core uses to reach the outside world.
 * Each one has a real adapter in src/adapters/<technology> and an in-memory
 * fake in src/adapters/memory for tests (docs/adr/0001-architecture.md).
 */
import type { Filing, ParsedDocument } from "./types";

/** Lists the filings that have been downloaded. */
export interface FilingCatalog {
  list(): Promise<Filing[]>;
}

/** Turns a downloaded filing into Markdown text. */
export interface DocumentParser {
  parse(filing: Filing): Promise<ParsedDocument>;
}
