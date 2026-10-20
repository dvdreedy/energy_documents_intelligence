/**
 * Naive chunking (roadmap step 1): clean up the parser's Markdown, split it at
 * 10-K items ("Item 7. …"), and pack paragraphs into chunks of at most
 * maxChars characters. Pure functions only. Layout-aware chunking comes in step 3,
 * and the evaluation harness (step 2) will show whether it beats this baseline.
 */
import type { Chunk, ParsedDocument } from "./types";

/** About 500 tokens of English, a common starting size for retrieval. */
export const DEFAULT_MAX_CHARS = 2000;

const COVER_SECTION = "Cover page and table of contents";

/**
 * A line that starts a 10-K item, e.g. "Item 1. Business." or "Item 1(a). Risk Factors."
 * (some companies write "Item 1A."). Real item headings are short standalone
 * lines, so long lines are treated as text that happens to mention an item.
 */
const ITEM_HEADING = /^Item\s+\d+(?:\([a-c]\)|[A-C])?\.\s/i;
const MAX_HEADING_CHARS = 200;

/** "PART I" … "PART IV" lines only group items, so they are dropped. */
const PART_HEADING = /^PART\s+[IV]+\.?$/i;

/**
 * Makes the parser's Markdown readable as plain text: tables become one line
 * per row, Markdown escapes ("\_", "\-") are removed, and blank runs collapse.
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(
      /<table>[\s\S]*?<\/table>/g,
      (table) => `\n\n${tableToText(table)}\n\n`,
    )
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Turns an HTML table into lines like "Total revenue | $22,944 | $23,018".
 * Filings pad tables with empty layout cells and put "$" and "%" in cells of
 * their own; empty cells are dropped and "$" and "%" are joined to their number.
 */
export function tableToText(tableHtml: string): string {
  const lines: string[] = [];
  for (const row of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells: string[] = [];
    let pendingPrefix = "";
    for (const cell of (row[1] ?? "").matchAll(
      /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g,
    )) {
      const text = cellText(cell[1] ?? "");
      const previous = cells.length - 1;
      if (text === "") continue;
      if (text === "$") {
        pendingPrefix = "$";
      } else if ((text === "%" || text === ")") && previous >= 0) {
        cells[previous] += text;
      } else {
        cells.push(pendingPrefix + text);
        pendingPrefix = "";
      }
    }
    if (cells.length > 0) lines.push(cells.join(" | "));
  }
  return lines.join("\n");
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Section {
  heading: string;
  text: string;
}

/**
 * Splits cleaned text at 10-K item headings. Text before the first item (the
 * cover page and table of contents) becomes its own section. Empty sections
 * are dropped.
 */
export function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let heading = COVER_SECTION;
  let lines: string[] = [];

  const finish = () => {
    const body = lines.join("\n").trim();
    if (body !== "") sections.push({ heading, text: body });
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (PART_HEADING.test(trimmed)) continue;
    if (isItemHeading(trimmed)) {
      finish();
      heading = trimmed;
      lines = [];
    } else {
      lines.push(line);
    }
  }
  finish();
  return sections;
}

/**
 * Table rows are excluded: the table of contents has rows like
 * "Item 7. | Management’s Discussion… | 39" that are not where the item starts.
 */
function isItemHeading(line: string): boolean {
  return (
    ITEM_HEADING.test(line) &&
    line.length <= MAX_HEADING_CHARS &&
    !line.includes(" | ")
  );
}

/**
 * Packs paragraphs (separated by blank lines) into pieces of at most maxChars.
 * Paragraphs stay whole when they fit; longer ones are split by line (table
 * rows), then by sentence, then, as a last resort, at maxChars.
 */
export function packParagraphs(text: string, maxChars: number): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  return pack(
    paragraphs.flatMap((p) => splitLong(p, maxChars)),
    maxChars,
    "\n\n",
  );
}

function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const [units, separator] = text.includes("\n")
    ? [text.split("\n"), "\n"]
    : [text.split(/(?<=[.!?])\s+/), " "];
  if (units.length === 1) return hardSplit(text, maxChars);
  return pack(
    units.flatMap((u) => splitLong(u, maxChars)),
    maxChars,
    separator,
  );
}

function hardSplit(text: string, maxChars: number): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += maxChars) {
    pieces.push(text.slice(start, start + maxChars));
  }
  return pieces;
}

/** Greedily joins pieces (each already <= maxChars) without exceeding maxChars. */
function pack(pieces: string[], maxChars: number, separator: string): string[] {
  const packed: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current === "") {
      current = piece;
    } else if (current.length + separator.length + piece.length <= maxChars) {
      current += separator + piece;
    } else {
      packed.push(current);
      current = piece;
    }
  }
  if (current !== "") packed.push(current);
  return packed;
}

/** Cleans, splits and packs one parsed filing into chunks, numbered in reading order. */
export function chunkDocument(
  document: ParsedDocument,
  maxChars: number = DEFAULT_MAX_CHARS,
): Chunk[] {
  const { filing } = document;
  const chunks: Chunk[] = [];
  for (const section of splitSections(cleanMarkdown(document.markdown))) {
    for (const text of packParagraphs(section.text, maxChars)) {
      chunks.push({
        id: `${filing.ticker}-${filing.fiscalYear}-${String(chunks.length).padStart(4, "0")}`,
        ticker: filing.ticker,
        company: filing.company,
        fiscalYear: filing.fiscalYear,
        section: section.heading,
        text,
        sourceUrl: filing.sourceUrl,
      });
    }
  }
  return chunks;
}
