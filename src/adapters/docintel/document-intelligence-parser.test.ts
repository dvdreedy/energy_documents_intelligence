import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import type { Filing } from "../../core/types";
import {
  analyzeUrl,
  cacheFileFor,
  operationStatus,
  retryAfterMs,
  toParsedDocument,
} from "./document-intelligence-parser";

const filing: Filing = {
  ticker: "HAL",
  company: "HALLIBURTON CO",
  cik: 45012,
  form: "10-K",
  accessionNumber: "0000045012-25-000010",
  filingDate: "2025-02-12",
  reportDate: "2024-12-31",
  primaryDocument: "hal-20241231.htm",
  fiscalYear: 2024,
  sourceUrl: "https://www.sec.gov/example",
  file: "data/raw/HAL-2024-10k.htm",
};

describe("analyzeUrl", () => {
  it("builds the prebuilt-layout URL with Markdown output, with or without a trailing slash", () => {
    const expected =
      "https://example.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&outputContentFormat=markdown";
    assert.equal(
      analyzeUrl("https://example.cognitiveservices.azure.com/"),
      expected,
    );
    assert.equal(
      analyzeUrl("https://example.cognitiveservices.azure.com"),
      expected,
    );
  });
});

describe("cacheFileFor", () => {
  it("names the cache file after the raw file", () => {
    assert.equal(
      cacheFileFor(filing, path.join("data", "parsed")),
      path.join("data", "parsed", "HAL-2024-10k.layout.json"),
    );
  });
});

describe("retryAfterMs", () => {
  it("converts seconds to milliseconds", () => {
    assert.equal(retryAfterMs("3"), 3000);
  });

  it("falls back to the default for a missing or invalid header", () => {
    assert.equal(retryAfterMs(null), 2000);
    assert.equal(retryAfterMs("soon"), 2000);
    assert.equal(retryAfterMs("0"), 2000);
  });
});

describe("operationStatus", () => {
  it("reads the status field", () => {
    assert.equal(operationStatus({ status: "running" }), "running");
  });

  it("throws when there is no status", () => {
    assert.throws(() => operationStatus({}), /no status/);
    assert.throws(() => operationStatus(null), /no status/);
  });
});

describe("toParsedDocument", () => {
  it("takes the Markdown from analyzeResult.content", () => {
    const parsed = toParsedDocument(filing, {
      status: "succeeded",
      analyzeResult: { content: "# Halliburton" },
    });
    assert.equal(parsed.markdown, "# Halliburton");
    assert.equal(parsed.filing, filing);
  });

  it("rejects an unfinished or empty response", () => {
    assert.throws(
      () => toParsedDocument(filing, { status: "running" }),
      /has not succeeded/,
    );
    assert.throws(
      () => toParsedDocument(filing, { status: "succeeded" }),
      /no analyzeResult.content/,
    );
  });
});
