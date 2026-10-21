import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryChatModel } from "../adapters/memory/chat";
import {
  InMemoryEmbedder,
  InMemorySearchIndex,
} from "../adapters/memory/search";
import {
  NOT_FOUND_ANSWER,
  SYSTEM_PROMPT,
  askQuestion,
  buildMessages,
  extractCitations,
  formatAnswer,
} from "./answer";
import type { Chunk, SearchHit } from "./types";

function chunk(id: string, text: string): Chunk {
  return {
    id,
    ticker: "HAL",
    company: "HALLIBURTON CO",
    fiscalYear: 2024,
    section: "Item 8. Financial Statements and Supplementary Data.",
    text,
    sourceUrl: `https://www.sec.gov/${id}`,
  };
}

const hits: SearchHit[] = [
  { chunk: chunk("HAL-2024-0115", "Total revenue | $22,944"), score: 0.8 },
  {
    chunk: chunk("HAL-2024-0004", "Halliburton was founded in 1919."),
    score: 0.7,
  },
];

describe("buildMessages", () => {
  it("numbers the sources with their labels and ends with the question", () => {
    const [system, user] = buildMessages("What was revenue?", hits);
    assert.equal(system?.content, SYSTEM_PROMPT);
    assert.equal(
      user?.content,
      "Sources:\n\n" +
        "[1] HALLIBURTON CO (HAL) FY2024 Form 10-K, Item 8. Financial Statements and Supplementary Data.\nTotal revenue | $22,944\n\n" +
        "[2] HALLIBURTON CO (HAL) FY2024 Form 10-K, Item 8. Financial Statements and Supplementary Data.\nHalliburton was founded in 1919.\n\n" +
        "Question: What was revenue?",
    );
  });
});

describe("extractCitations", () => {
  it("maps markers to sources in order of first mention, once each", () => {
    const citations = extractCitations(
      "Founded in 1919 [2]. Revenue was $22,944 million [1][2].",
      hits,
    );
    assert.deepEqual(
      citations.map((c) => [c.marker, c.chunkId]),
      [
        [2, "HAL-2024-0004"],
        [1, "HAL-2024-0115"],
      ],
    );
  });

  it("accepts comma-separated markers and ignores ones that point nowhere", () => {
    const citations = extractCitations("Revenue [1, 7]. Other [0].", hits);
    assert.deepEqual(
      citations.map((c) => c.marker),
      [1],
    );
  });

  it("returns no citations for the not-found answer", () => {
    assert.deepEqual(extractCitations(NOT_FOUND_ANSWER, hits), []);
  });
});

describe("formatAnswer", () => {
  it("lists the cited sources under the answer", () => {
    const text = formatAnswer({
      text: "Revenue was $22,944 million [1].",
      citations: extractCitations("[1]", hits),
    });
    assert.equal(
      text,
      "Revenue was $22,944 million [1].\n\nSources:\n" +
        "[1] HALLIBURTON CO (HAL) FY2024 Form 10-K, Item 8. Financial Statements and Supplementary Data.\n" +
        "    https://www.sec.gov/HAL-2024-0115",
    );
  });
});

describe("askQuestion", () => {
  async function setUp(reply: string) {
    const embedder = new InMemoryEmbedder();
    const index = new InMemorySearchIndex();
    const chunks = hits.map((h) => h.chunk);
    const vectors = await embedder.embed(chunks.map((c) => c.text));
    await index.upsert(
      chunks.map((c, i) => ({
        chunk: c,
        vector: vectors[i] ?? [],
        accessGroups: ["public"],
      })),
    );
    const chat = new InMemoryChatModel(reply);
    return { ports: { embedder, index, chat }, chat };
  }

  it("retrieves sources, asks the model and returns the cited ones", async () => {
    const { ports, chat } = await setUp("Revenue was $22,944 million [1].");
    const answer = await askQuestion(ports, "Total revenue?", {
      allowedGroups: ["public"],
      top: 2,
    });
    assert.equal(answer.text, "Revenue was $22,944 million [1].");
    assert.equal(answer.citations.length, 1);
    assert.equal(chat.conversations.length, 1);
    assert.match(chat.conversations[0]?.[1]?.content ?? "", /\[2\]/);
  });

  it("does not call the model when the asker may see nothing", async () => {
    const { ports, chat } = await setUp("unused");
    const answer = await askQuestion(ports, "Total revenue?", {
      allowedGroups: ["finance"],
    });
    assert.deepEqual(answer, { text: NOT_FOUND_ANSWER, citations: [] });
    assert.equal(chat.conversations.length, 0);
  });

  it("rejects an empty question", async () => {
    const { ports } = await setUp("unused");
    await assert.rejects(
      askQuestion(ports, "  ", { allowedGroups: ["public"] }),
      /question is empty/,
    );
  });
});
