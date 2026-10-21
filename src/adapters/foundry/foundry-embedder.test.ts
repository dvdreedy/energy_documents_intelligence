import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { embeddingsUrl, readEmbeddings } from "./foundry-embedder";

describe("embeddingsUrl", () => {
  it("uses the v1 embeddings path, with or without a trailing slash", () => {
    const expected = "https://example.openai.azure.com/openai/v1/embeddings";
    assert.equal(embeddingsUrl("https://example.openai.azure.com/"), expected);
    assert.equal(embeddingsUrl("https://example.openai.azure.com"), expected);
  });
});

describe("readEmbeddings", () => {
  it("returns vectors in input order, using each item's index", () => {
    const json = {
      data: [
        { index: 1, embedding: [0.3, 0.4] },
        { index: 0, embedding: [0.1, 0.2] },
      ],
    };
    assert.deepEqual(readEmbeddings(json, 2), [
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
  });

  it("rejects a response with the wrong number of items", () => {
    assert.throws(() => readEmbeddings({ data: [] }, 1), /should have 1 items/);
  });

  it("rejects a repeated index, which would leave a text without a vector", () => {
    const json = {
      data: [
        { index: 0, embedding: [1] },
        { index: 0, embedding: [2] },
      ],
    };
    assert.throws(() => readEmbeddings(json, 2), /repeats index 0/);
  });

  it("rejects a malformed item", () => {
    assert.throws(
      () => readEmbeddings({ data: [{ index: 5, embedding: [1] }] }, 1),
      /malformed item/,
    );
    assert.throws(
      () => readEmbeddings({ data: [{ index: 0, embedding: ["x"] }] }, 1),
      /malformed item/,
    );
  });
});
