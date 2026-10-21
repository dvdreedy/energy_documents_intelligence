/**
 * Use case: parse, chunk, embed and index filings so they can be searched.
 */
import { chunkDocument } from "./chunking";
import { parseFilings, type FilingSelection } from "./parse-filings";
import type {
  DocumentParser,
  Embedder,
  FilingCatalog,
  SearchIndex,
} from "./ports";
import type { AccessGroup, Chunk, IndexedChunk } from "./types";

/**
 * SEC filings are public, so every chunk is shared with everyone for now.
 * Roadmap step 4 adds restricted groups to show permission-aware retrieval.
 */
export const PUBLIC_GROUP: AccessGroup = "public";

/**
 * Chunks per embedding request. Small enough to stay well under the
 * deployment's tokens-per-minute limit, big enough to keep requests few.
 */
export const EMBEDDING_BATCH_SIZE = 32;

export interface IngestPorts {
  catalog: FilingCatalog;
  parser: DocumentParser;
  embedder: Embedder;
  index: SearchIndex;
}

export interface IngestProgress {
  ticker: string;
  fiscalYear: number;
  chunks: number;
}

/**
 * The text that gets embedded: the chunk with a one-line header saying where
 * it comes from. A passage like "Revenue increased 4%" says nothing about
 * which company or year it is about; the header puts that into the vector.
 */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.company} (${chunk.ticker}) ${chunk.fiscalYear} Form 10-K, ${chunk.section}\n\n${chunk.text}`;
}

export function batches<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`Batch size must be a positive integer, got ${size}`);
  }
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    result.push(items.slice(start, start + size));
  }
  return result;
}

/**
 * Pairs each chunk with its vector. Checks the embedder kept its promise
 * (one vector per text, each the right length) so a bad response fails here
 * instead of producing a silently broken index.
 */
export function toIndexedChunks(
  chunks: Chunk[],
  vectors: number[][],
  dimensions: number,
): IndexedChunk[] {
  if (vectors.length !== chunks.length) {
    throw new Error(
      `Embedder returned ${vectors.length} vectors for ${chunks.length} chunks`,
    );
  }
  return chunks.map((chunk, i) => {
    const vector = vectors[i];
    if (vector === undefined || vector.length !== dimensions) {
      throw new Error(
        `Vector for ${chunk.id} has ${vector?.length ?? 0} dimensions, expected ${dimensions}`,
      );
    }
    return { chunk, vector, accessGroups: [PUBLIC_GROUP] };
  });
}

/** Indexes the selected filings. Rerunning replaces chunks by id, so it is safe. */
export async function ingestFilings(
  ports: IngestPorts,
  selection: FilingSelection,
  onProgress: (progress: IngestProgress) => void = () => {},
): Promise<number> {
  const { catalog, parser, embedder, index } = ports;
  await index.ensureIndex();

  let total = 0;
  for (const document of await parseFilings(catalog, parser, selection)) {
    const chunks = chunkDocument(document);
    for (const batch of batches(chunks, EMBEDDING_BATCH_SIZE)) {
      const vectors = await embedder.embed(batch.map(embeddingText));
      await index.upsert(toIndexedChunks(batch, vectors, embedder.dimensions));
    }
    total += chunks.length;
    const { ticker, fiscalYear } = document.filing;
    onProgress({ ticker, fiscalYear, chunks: chunks.length });
  }
  return total;
}
