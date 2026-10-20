import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseManifest } from "./manifest-catalog";

const entry = {
  ticker: "HAL",
  company: "HALLIBURTON CO",
  cik: 45012,
  form: "10-K",
  accessionNumber: "0000045012-25-000010",
  filingDate: "2025-02-12",
  reportDate: "2024-12-31",
  primaryDocument: "hal-20241231.htm",
  fiscalYear: 2024,
  sourceUrl:
    "https://www.sec.gov/Archives/edgar/data/45012/000004501225000010/hal-20241231.htm",
  file: "data/raw/HAL-2024-10k.htm",
};

describe("parseManifest", () => {
  it("reads a well-formed manifest", () => {
    assert.deepEqual(parseManifest([entry]), [entry]);
  });

  it("rejects a manifest that is not an array", () => {
    assert.throws(() => parseManifest({}), /must be a JSON array/);
  });

  it("names the entry and field that is missing", () => {
    const withoutFile: Record<string, unknown> = { ...entry };
    delete withoutFile.file;
    assert.throws(
      () => parseManifest([entry, withoutFile]),
      /entry 1 has no file/,
    );
  });

  it("rejects a number stored as text", () => {
    assert.throws(
      () => parseManifest([{ ...entry, fiscalYear: "2024" }]),
      /entry 0 has no numeric fiscalYear/,
    );
  });
});
