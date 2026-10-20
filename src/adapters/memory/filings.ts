/** In-memory fakes for FilingCatalog and DocumentParser, for unit tests. */
import type { DocumentParser, FilingCatalog } from "../../core/ports";
import type { Filing, ParsedDocument } from "../../core/types";

export class InMemoryFilingCatalog implements FilingCatalog {
  constructor(private readonly filings: Filing[]) {}

  async list(): Promise<Filing[]> {
    return [...this.filings];
  }
}

/**
 * Returns canned Markdown keyed by the filing's local file path, and records
 * which filings it was asked to parse so tests can check the calls.
 */
export class InMemoryDocumentParser implements DocumentParser {
  readonly parsed: Filing[] = [];

  constructor(private readonly markdownByFile: Record<string, string>) {}

  async parse(filing: Filing): Promise<ParsedDocument> {
    const markdown = this.markdownByFile[filing.file];
    if (markdown === undefined) {
      throw new Error(`No fake Markdown for ${filing.file}`);
    }
    this.parsed.push(filing);
    return { filing, markdown };
  }
}
