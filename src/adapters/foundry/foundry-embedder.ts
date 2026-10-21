/**
 * Embedder backed by a text-embedding-3-small deployment in Microsoft Foundry,
 * called through the OpenAI-compatible v1 REST API with an Entra ID token.
 *
 * `dimensions` asks the model for shorter vectors (it supports this natively).
 * 512 instead of the default 1,536 makes the index a third of the size, which
 * keeps all filings inside the Free Search tier's 50 MB.
 */
import type { TokenCredential } from "@azure/identity";
import type { Embedder } from "../../core/ports";
import { bearer, fetchWithRetry } from "../azure/http";

const TOKEN_SCOPE = "https://ai.azure.com/.default";

export interface FoundryEmbedderOptions {
  endpoint: string;
  deployment: string;
  dimensions: number;
  credential: TokenCredential;
}

export class FoundryEmbedder implements Embedder {
  readonly dimensions: number;

  constructor(private readonly options: FoundryEmbedderOptions) {
    this.dimensions = options.dimensions;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const response = await fetchWithRetry(
      embeddingsUrl(this.options.endpoint),
      {
        method: "POST",
        headers: {
          Authorization: await bearer(this.options.credential, TOKEN_SCOPE),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.deployment,
          input: texts,
          dimensions: this.dimensions,
        }),
      },
      `Embedding ${texts.length} texts`,
    );
    return readEmbeddings(await response.json(), texts.length);
  }
}

export function embeddingsUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/openai/v1/embeddings`;
}

/**
 * Reads `data[].embedding` from the response, ordered by `data[].index` so
 * vector i always belongs to text i.
 */
export function readEmbeddings(json: unknown, expected: number): number[][] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length !== expected) {
    throw new Error(
      `Embedding response should have ${expected} items in "data"`,
    );
  }
  const vectors: number[][] = new Array<number[]>(expected);
  for (const item of data as Array<{ index?: unknown; embedding?: unknown }>) {
    const { index, embedding } = item;
    if (
      typeof index !== "number" ||
      index < 0 ||
      index >= expected ||
      !Array.isArray(embedding) ||
      !embedding.every((n) => typeof n === "number")
    ) {
      throw new Error("Embedding response has a malformed item");
    }
    if (vectors[index] !== undefined) {
      throw new Error(`Embedding response repeats index ${index}`);
    }
    vectors[index] = embedding;
  }
  // `expected` items with no repeats and every index in range: all slots filled.
  return vectors;
}
