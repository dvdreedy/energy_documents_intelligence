/** In-memory fakes for Embedder and SearchIndex, for unit tests. */
import type { Embedder, SearchIndex, VectorQuery } from "../../core/ports";
import type { IndexedChunk, SearchHit } from "../../core/types";

/**
 * A toy embedder: counts letters into `dimensions` buckets. Texts that share
 * letters get similar vectors, which is enough to test ranking without a model.
 */
export class InMemoryEmbedder implements Embedder {
  readonly calls: string[][] = [];

  constructor(readonly dimensions = 8) {}

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);
    return texts.map((text) => {
      const vector = new Array<number>(this.dimensions).fill(0);
      for (const char of text.toLowerCase()) {
        const code = char.charCodeAt(0);
        if (code >= 97 && code <= 122) {
          const bucket = code % this.dimensions;
          vector[bucket] = (vector[bucket] ?? 0) + 1;
        }
      }
      return vector;
    });
  }
}

export class InMemorySearchIndex implements SearchIndex {
  readonly documents = new Map<string, IndexedChunk>();
  ensureIndexCalls = 0;

  async ensureIndex(): Promise<void> {
    this.ensureIndexCalls++;
  }

  async upsert(chunks: IndexedChunk[]): Promise<void> {
    for (const indexed of chunks) this.documents.set(indexed.chunk.id, indexed);
  }

  async search(query: VectorQuery): Promise<SearchHit[]> {
    const allowed = new Set(query.allowedGroups);
    return [...this.documents.values()]
      .filter((d) => d.accessGroups.some((g) => allowed.has(g)))
      .map((d) => ({ chunk: d.chunk, score: cosine(query.vector, d.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, query.top);
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}
