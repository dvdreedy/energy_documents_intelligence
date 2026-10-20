import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryDocumentParser,
  InMemoryFilingCatalog,
} from "../adapters/memory/filings";
import { parseFilings, selectFilings } from "./parse-filings";
import type { Filing } from "./types";

function filing(ticker: string, fiscalYear: number): Filing {
  return {
    ticker,
    company: `${ticker} Inc.`,
    cik: 1,
    form: "10-K",
    accessionNumber: `0000000001-${fiscalYear}-000001`,
    filingDate: `${fiscalYear + 1}-02-20`,
    reportDate: `${fiscalYear}-12-31`,
    primaryDocument: `${ticker.toLowerCase()}-${fiscalYear}1231.htm`,
    fiscalYear,
    sourceUrl: `https://www.sec.gov/example/${ticker}-${fiscalYear}`,
    file: `data/raw/${ticker}-${fiscalYear}-10k.htm`,
  };
}

const filings = [
  filing("CVX", 2025),
  filing("CVX", 2024),
  filing("HAL", 2025),
  filing("HAL", 2024),
];

describe("selectFilings", () => {
  it("returns everything for an empty selection", () => {
    assert.equal(selectFilings(filings, {}).length, 4);
  });

  it("filters by ticker, ignoring case", () => {
    const selected = selectFilings(filings, { ticker: "hal" });
    assert.deepEqual(
      selected.map((f) => f.file),
      ["data/raw/HAL-2025-10k.htm", "data/raw/HAL-2024-10k.htm"],
    );
  });

  it("filters by ticker and fiscal year together", () => {
    const selected = selectFilings(filings, {
      ticker: "HAL",
      fiscalYear: 2024,
    });
    assert.deepEqual(
      selected.map((f) => f.file),
      ["data/raw/HAL-2024-10k.htm"],
    );
  });
});

describe("parseFilings", () => {
  it("parses only the selected filings, in catalog order", async () => {
    const parser = new InMemoryDocumentParser({
      "data/raw/CVX-2024-10k.htm": "# Chevron 2024",
      "data/raw/HAL-2024-10k.htm": "# Halliburton 2024",
    });
    const reported: string[] = [];

    const documents = await parseFilings(
      new InMemoryFilingCatalog(filings),
      parser,
      { fiscalYear: 2024 },
      (d) => reported.push(d.filing.ticker),
    );

    assert.deepEqual(
      documents.map((d) => d.markdown),
      ["# Chevron 2024", "# Halliburton 2024"],
    );
    assert.deepEqual(reported, ["CVX", "HAL"]);
    assert.equal(parser.parsed.length, 2);
  });

  it("fails loudly when nothing matches the selection", async () => {
    await assert.rejects(
      parseFilings(
        new InMemoryFilingCatalog(filings),
        new InMemoryDocumentParser({}),
        { ticker: "XYZ" },
      ),
      /No downloaded filings match/,
    );
  });
});
