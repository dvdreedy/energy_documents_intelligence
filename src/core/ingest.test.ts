import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryDocumentParser,
  InMemoryFilingCatalog,
} from "../adapters/memory/filings";
import {
  InMemoryEmbedder,
  InMemorySearchIndex,
} from "../adapters/memory/search";
import {
  EMBEDDING_BATCH_SIZE,
  PUBLIC_GROUP,
  batches,
  embeddingText,
  ingestFilings,
  toIndexedChunks,
} from "./ingest";
import type { Chunk, Filing } from "./types";

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

const chunk: Chunk = {
  id: "HAL-2024-0001",
  ticker: "HAL",
  company: "HALLIBURTON CO",
  fiscalYear: 2024,
  section: "Item 7. Management’s Discussion and Analysis.",
  text: "Revenue decreased slightly.",
  sourceUrl: filing.sourceUrl,
};

describe("embeddingText", () => {
  it("prefixes the chunk with where it comes from", () => {
    assert.equal(
      embeddingText(chunk),
      "HALLIBURTON CO (HAL) 2024 Form 10-K, Item 7. Management’s Discussion and Analysis.\n\nRevenue decreased slightly.",
    );
  });
});

describe("batches", () => {
  it("splits into batches of at most the given size", () => {
    assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(batches([], 2), []);
  });

  it("rejects a size below 1", () => {
    assert.throws(() => batches([1], 0), /positive integer/);
  });
});

describe("toIndexedChunks", () => {
  it("pairs chunks with vectors and shares them with the public group", () => {
    assert.deepEqual(toIndexedChunks([chunk], [[1, 2]], 2), [
      { chunk, vector: [1, 2], accessGroups: [PUBLIC_GROUP] },
    ]);
  });

  it("fails when the embedder returns the wrong number of vectors", () => {
    assert.throws(() => toIndexedChunks([chunk], [], 2), /0 vectors for 1/);
  });

  it("fails when a vector has the wrong length", () => {
    assert.throws(
      () => toIndexedChunks([chunk], [[1, 2, 3]], 2),
      /has 3 dimensions, expected 2/,
    );
  });
});

describe("ingestFilings", () => {
  // Enough paragraphs to need more than one embedding batch. Each is just
  // under 2,000 characters, so each becomes exactly one chunk.
  const paragraphs = Array.from(
    { length: EMBEDDING_BATCH_SIZE + 3 },
    (_, i) => `Paragraph ${i} ${"x".repeat(1980)}`,
  );
  const markdown = ["Item 1. Business.", ...paragraphs].join("\n\n");

  async function run() {
    const embedder = new InMemoryEmbedder();
    const index = new InMemorySearchIndex();
    const total = await ingestFilings(
      {
        catalog: new InMemoryFilingCatalog([filing]),
        parser: new InMemoryDocumentParser({ [filing.file]: markdown }),
        embedder,
        index,
      },
      {},
    );
    return { embedder, index, total };
  }

  it("creates the index, embeds in batches and stores every chunk", async () => {
    const { embedder, index, total } = await run();
    assert.equal(index.ensureIndexCalls, 1);
    assert.equal(total, EMBEDDING_BATCH_SIZE + 3);
    assert.equal(index.documents.size, total);
    assert.deepEqual(
      embedder.calls.map((c) => c.length),
      [EMBEDDING_BATCH_SIZE, 3],
    );
  });

  it("finds an indexed chunk again only for an allowed group", async () => {
    const { embedder, index } = await run();
    const stored = index.documents.get("HAL-2024-0000");
    assert.ok(stored);
    const [vector] = await embedder.embed([embeddingText(stored.chunk)]);
    assert.ok(vector);

    const publicHits = await index.search({
      vector,
      top: 1,
      allowedGroups: [PUBLIC_GROUP],
    });
    assert.equal(publicHits[0]?.chunk.id, "HAL-2024-0000");

    const otherHits = await index.search({
      vector,
      top: 1,
      allowedGroups: ["finance"],
    });
    assert.deepEqual(otherHits, []);
  });
});
