/**
 * Use case: turn downloaded filings into Markdown, the first step of ingestion.
 */
import type { DocumentParser, FilingCatalog } from "./ports";
import type { Filing, ParsedDocument } from "./types";

/** Narrows the filings to parse. Leaving a field out means "any". */
export interface FilingSelection {
  ticker?: string;
  fiscalYear?: number;
}

export function selectFilings(
  filings: Filing[],
  selection: FilingSelection,
): Filing[] {
  const ticker = selection.ticker?.toUpperCase();
  return filings.filter(
    (f) =>
      (ticker === undefined || f.ticker === ticker) &&
      (selection.fiscalYear === undefined ||
        f.fiscalYear === selection.fiscalYear),
  );
}

/**
 * Parses the selected filings one at a time. Sequential on purpose: parsing is
 * billed per page, and one at a time keeps cost and failures easy to follow.
 * Fails if the selection matches nothing, so a typo in a ticker is not silent.
 */
export async function parseFilings(
  catalog: FilingCatalog,
  parser: DocumentParser,
  selection: FilingSelection,
  onParsed: (document: ParsedDocument) => void = () => {},
): Promise<ParsedDocument[]> {
  const filings = selectFilings(await catalog.list(), selection);
  if (filings.length === 0) {
    throw new Error(
      `No downloaded filings match ${JSON.stringify(selection)}. Run npm run download first?`,
    );
  }

  const documents: ParsedDocument[] = [];
  for (const filing of filings) {
    const document = await parser.parse(filing);
    onParsed(document);
    documents.push(document);
  }
  return documents;
}
