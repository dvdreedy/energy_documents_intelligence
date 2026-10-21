/**
 * Ports: the interfaces the core uses to reach the outside world.
 * Each one has a real adapter in src/adapters/<technology> and an in-memory
 * fake in src/adapters/memory for tests (docs/adr/0001-architecture.md).
 */
import type {
  AccessGroup,
  ChatMessage,
  Filing,
  IndexedChunk,
  ParsedDocument,
  SearchHit,
} from "./types";

/** Lists the filings that have been downloaded. */
export interface FilingCatalog {
  list(): Promise<Filing[]>;
}

/** Turns a downloaded filing into Markdown text. */
export interface DocumentParser {
  parse(filing: Filing): Promise<ParsedDocument>;
}

/** Turns texts into embedding vectors, one per text, in the same order. */
export interface Embedder {
  /** Length of every vector this embedder returns. */
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorQuery {
  vector: number[];
  /** How many hits to return. */
  top: number;
  /**
   * The caller's groups. Required, so no caller and no adapter can forget the
   * permission filter: only chunks shared with at least one of these groups
   * are returned. An empty list returns nothing.
   */
  allowedGroups: AccessGroup[];
}

/** Stores chunks with their vectors and finds the closest ones to a query. */
export interface SearchIndex {
  /** Creates the index if it does not exist yet. Safe to call every run. */
  ensureIndex(): Promise<void>;
  /** Adds chunks, replacing any with the same id, so reruns do not duplicate. */
  upsert(chunks: IndexedChunk[]): Promise<void>;
  search(query: VectorQuery): Promise<SearchHit[]>;
}

/**
 * A chat language model. Kept to one method so models are easy to swap and
 * compare: gpt-5-mini now, Claude behind the same port in roadmap step 4.
 */
export interface ChatModel {
  /** Returns the model's reply to the conversation so far. */
  complete(messages: ChatMessage[]): Promise<string>;
}
