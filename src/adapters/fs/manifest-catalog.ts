/**
 * FilingCatalog backed by data/raw/manifest.json, which npm run download writes.
 */
import { readFile } from "node:fs/promises";
import type { FilingCatalog } from "../../core/ports";
import type { Filing } from "../../core/types";

export class ManifestFilingCatalog implements FilingCatalog {
  constructor(private readonly manifestPath: string) {}

  async list(): Promise<Filing[]> {
    let text: string;
    try {
      text = await readFile(this.manifestPath, "utf8");
    } catch (error) {
      throw new Error(
        `Cannot read ${this.manifestPath}. Run npm run download first.`,
        { cause: error },
      );
    }
    return parseManifest(JSON.parse(text));
  }
}

/**
 * Checks the manifest's shape instead of trusting a type cast, so a hand-edited
 * or outdated manifest fails here with a clear message, not later in ingestion.
 */
export function parseManifest(json: unknown): Filing[] {
  if (!Array.isArray(json)) {
    throw new Error("Manifest must be a JSON array of filings");
  }
  return json.map((entry: unknown, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`Manifest entry ${index} is not an object`);
    }
    const record = entry as Record<string, unknown>;
    const text = (name: string) => readString(record, name, index);
    const number = (name: string) => readNumber(record, name, index);
    return {
      ticker: text("ticker"),
      company: text("company"),
      cik: number("cik"),
      form: text("form"),
      accessionNumber: text("accessionNumber"),
      filingDate: text("filingDate"),
      reportDate: text("reportDate"),
      primaryDocument: text("primaryDocument"),
      fiscalYear: number("fiscalYear"),
      sourceUrl: text("sourceUrl"),
      file: text("file"),
    };
  });
}

function readString(
  record: Record<string, unknown>,
  name: string,
  index: number,
): string {
  const value = record[name];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Manifest entry ${index} has no ${name}`);
  }
  return value;
}

function readNumber(
  record: Record<string, unknown>,
  name: string,
  index: number,
): number {
  const value = record[name];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Manifest entry ${index} has no numeric ${name}`);
  }
  return value;
}
