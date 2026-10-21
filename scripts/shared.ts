/**
 * Helpers shared by the command-line scripts: reading the --ticker/--year
 * selection, and finding filings that have not been parsed (paid for) yet.
 */
import { access } from "node:fs/promises";
import { parseArgs } from "node:util";
import { cacheFileFor } from "../src/adapters/docintel/document-intelligence-parser";
import { PARSED_DIR } from "../src/composition";
import type { FilingSelection } from "../src/core/parse-filings";
import type { Filing } from "../src/core/types";

export interface CommonArgs {
  selection: FilingSelection;
  /** True when the user passed --confirm to allow billable Azure calls. */
  confirm: boolean;
}

/** Reads --ticker, --year and --confirm from the command line. */
export function readCommonArgs(): CommonArgs {
  const { values } = parseArgs({
    options: {
      ticker: { type: "string" },
      year: { type: "string" },
      confirm: { type: "boolean", default: false },
    },
  });
  const selection: FilingSelection = {};
  if (values.ticker !== undefined) selection.ticker = values.ticker;
  if (values.year !== undefined) {
    const year = Number(values.year);
    if (!Number.isInteger(year)) {
      throw new Error(`--year must be a year like 2024, got "${values.year}"`);
    }
    selection.fiscalYear = year;
  }
  return { selection, confirm: values.confirm };
}

/** Filings with no cached Document Intelligence result in data/parsed/. */
export async function uncachedFilings(filings: Filing[]): Promise<Filing[]> {
  const uncached: Filing[] = [];
  for (const filing of filings) {
    try {
      await access(cacheFileFor(filing, PARSED_DIR));
    } catch {
      uncached.push(filing);
    }
  }
  return uncached;
}
