/**
 * Domain types shared by the core, the ports and the adapters.
 * Plain data only: no behavior, no SDK types.
 */

/** One annual report (10-K) downloaded from SEC EDGAR. */
export interface Filing {
  ticker: string;
  company: string;
  /** SEC company ID, unpadded (Chevron is 93410). */
  cik: number;
  form: string;
  accessionNumber: string;
  filingDate: string;
  /** Last day of the period the report covers, e.g. "2025-12-31". */
  reportDate: string;
  primaryDocument: string;
  fiscalYear: number;
  /** Public EDGAR link to the original document, used in citations. */
  sourceUrl: string;
  /** Local path of the downloaded HTML, relative to the repository root. */
  file: string;
}

/**
 * A passage of a filing small enough to embed and retrieve on its own.
 * Carries what a citation needs, so an answer can point back to its source.
 */
export interface Chunk {
  /** Unique and stable across runs, e.g. "HAL-2024-0042". */
  id: string;
  ticker: string;
  company: string;
  fiscalYear: number;
  /** The 10-K item the passage is in, e.g. "Item 7. Management’s Discussion and Analysis…". */
  section: string;
  text: string;
  sourceUrl: string;
}

/** A filing turned into text by a DocumentParser. */
export interface ParsedDocument {
  filing: Filing;
  /** The document's text as Markdown; tables are kept as HTML tables. */
  markdown: string;
}
