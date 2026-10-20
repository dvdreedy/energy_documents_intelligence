/**
 * Parses downloaded filings with Azure Document Intelligence into data/parsed/.
 *
 * Usage:
 *   npm run parse -- --ticker HAL --year 2024
 *   npm run parse -- --confirm            (all filings)
 *
 * Parsing is billed per page (about $10 per 1,000), so filings that are not in
 * data/parsed/ yet are only sent when --confirm is given. Cached ones are free.
 * Needs AZURE_DOCINTEL_ENDPOINT in .env and `az login`.
 */
import { access } from "node:fs/promises";
import { parseArgs } from "node:util";
import { cacheFileFor } from "../src/adapters/docintel/document-intelligence-parser";
import { PARSED_DIR, createParsing } from "../src/composition";
import { loadConfig } from "../src/config";
import {
  parseFilings,
  selectFilings,
  type FilingSelection,
} from "../src/core/parse-filings";

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function readSelection(values: {
  ticker?: string;
  year?: string;
}): FilingSelection {
  const selection: FilingSelection = {};
  if (values.ticker !== undefined) selection.ticker = values.ticker;
  if (values.year !== undefined) {
    const year = Number(values.year);
    if (!Number.isInteger(year)) {
      throw new Error(`--year must be a year like 2024, got "${values.year}"`);
    }
    selection.fiscalYear = year;
  }
  return selection;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      ticker: { type: "string" },
      year: { type: "string" },
      confirm: { type: "boolean", default: false },
    },
  });
  const selection = readSelection(values);
  const { catalog, parser } = createParsing(loadConfig());

  // Cost guard: list what would be billed before sending anything.
  const selected = selectFilings(await catalog.list(), selection);
  const uncached = [];
  for (const filing of selected) {
    if (!(await exists(cacheFileFor(filing, PARSED_DIR)))) {
      uncached.push(filing);
    }
  }
  if (uncached.length > 0 && !values.confirm) {
    console.log("Not parsed yet (would be billed by Document Intelligence):");
    for (const filing of uncached) console.log(`  ${filing.file}`);
    console.log("Rerun with --confirm to parse them.");
    process.exitCode = 1;
    return;
  }

  await parseFilings(catalog, parser, selection, (document) => {
    const { ticker, fiscalYear } = document.filing;
    console.log(
      `${ticker} ${fiscalYear}: ${document.markdown.length.toLocaleString()} characters of Markdown`,
    );
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
