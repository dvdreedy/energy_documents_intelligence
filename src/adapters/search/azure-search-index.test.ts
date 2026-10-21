import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Chunk } from "../../core/types";
import {
  failedKeys,
  indexDefinition,
  indexUrl,
  permissionFilter,
  toSearchDocument,
  toSearchHit,
} from "./azure-search-index";

const chunk: Chunk = {
  id: "HAL-2024-0001",
  ticker: "HAL",
  company: "HALLIBURTON CO",
  fiscalYear: 2024,
  section: "Item 7. Management’s Discussion and Analysis.",
  text: "Revenue decreased slightly.",
  sourceUrl: "https://www.sec.gov/example",
};

describe("indexUrl", () => {
  it("builds index URLs with the API version", () => {
    assert.equal(
      indexUrl(
        "https://example.search.windows.net/",
        "filings-v1",
        "/docs/search",
      ),
      "https://example.search.windows.net/indexes/filings-v1/docs/search?api-version=2024-07-01",
    );
  });
});

describe("indexDefinition", () => {
  it("sizes the vector field and keys the index on id", () => {
    const definition = indexDefinition("filings-v1", 512) as {
      fields: Array<{ name: string; key?: boolean; dimensions?: number }>;
    };
    assert.equal(definition.fields.find((f) => f.key)?.name, "id");
    assert.equal(
      definition.fields.find((f) => f.name === "embedding")?.dimensions,
      512,
    );
  });
});

describe("toSearchDocument", () => {
  it("flattens the chunk and adds groups, vector and the upsert action", () => {
    assert.deepEqual(
      toSearchDocument({ chunk, vector: [0.1], accessGroups: ["public"] }),
      {
        "@search.action": "mergeOrUpload",
        ...chunk,
        accessGroups: ["public"],
        embedding: [0.1],
      },
    );
  });
});

describe("permissionFilter", () => {
  it("matches any of the caller's groups", () => {
    assert.equal(
      permissionFilter(["public", "finance"]),
      "accessGroups/any(g: search.in(g, 'public,finance', ','))",
    );
  });

  it("rejects group names that could change the filter", () => {
    assert.throws(
      () => permissionFilter(["public') or true or ('x"]),
      /may only use letters/,
    );
  });
});

describe("failedKeys", () => {
  it("lists only the documents that failed", () => {
    const json = {
      value: [
        { key: "HAL-2024-0001", status: true },
        { key: "HAL-2024-0002", status: false, errorMessage: "too large" },
      ],
    };
    assert.deepEqual(failedKeys(json), ["HAL-2024-0002 (too large)"]);
  });
});

describe("toSearchHit", () => {
  it("translates a search result into a chunk and score", () => {
    assert.deepEqual(toSearchHit({ "@search.score": 0.83, ...chunk }), {
      chunk,
      score: 0.83,
    });
  });

  it("fails when a field is missing", () => {
    const withoutText: Record<string, unknown> = {
      "@search.score": 0.5,
      ...chunk,
    };
    delete withoutText.text;
    assert.throws(() => toSearchHit(withoutText), /missing text/);
  });
});
