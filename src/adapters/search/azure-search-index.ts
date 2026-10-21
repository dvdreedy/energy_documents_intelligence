/**
 * SearchIndex backed by Azure AI Search, called through its REST API with an
 * Entra ID token (the service has keys too, but this project never uses them).
 *
 * One search document per chunk: the chunk's fields, its access groups, and
 * its embedding. Retrieval in step 1 is pure vector search; step 3 adds
 * keyword (hybrid) search and semantic ranking, which is why `text` is
 * already marked searchable.
 */
import type { TokenCredential } from "@azure/identity";
import type { SearchIndex, VectorQuery } from "../../core/ports";
import type {
  AccessGroup,
  Chunk,
  IndexedChunk,
  SearchHit,
} from "../../core/types";
import { bearer, fetchWithRetry } from "../azure/http";

const API_VERSION = "2024-07-01";
const TOKEN_SCOPE = "https://search.azure.com/.default";
const VECTOR_FIELD = "embedding";
const CHUNK_FIELDS = [
  "id",
  "ticker",
  "company",
  "fiscalYear",
  "section",
  "text",
  "sourceUrl",
] as const;

export interface AzureSearchIndexOptions {
  endpoint: string;
  indexName: string;
  dimensions: number;
  credential: TokenCredential;
}

export class AzureSearchIndex implements SearchIndex {
  constructor(private readonly options: AzureSearchIndexOptions) {}

  async ensureIndex(): Promise<void> {
    const url = this.url("");
    const existing = await fetch(url, { headers: await this.headers() });
    if (existing.ok) return;
    if (existing.status !== 404) {
      throw new Error(
        `Checking index ${this.options.indexName} failed: ${existing.status} ${await existing.text()}`,
      );
    }
    await fetchWithRetry(
      url,
      {
        method: "PUT",
        headers: await this.headers(),
        body: JSON.stringify(
          indexDefinition(this.options.indexName, this.options.dimensions),
        ),
      },
      `Creating index ${this.options.indexName}`,
    );
  }

  async upsert(chunks: IndexedChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const response = await fetchWithRetry(
      this.url("/docs/index"),
      {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({ value: chunks.map(toSearchDocument) }),
      },
      `Uploading ${chunks.length} chunks`,
    );
    // 207 means some documents failed while others succeeded; check each one.
    const failed = failedKeys(await response.json());
    if (failed.length > 0) {
      throw new Error(`Search rejected chunks: ${failed.join(", ")}`);
    }
  }

  async search(query: VectorQuery): Promise<SearchHit[]> {
    if (query.allowedGroups.length === 0) return [];
    const response = await fetchWithRetry(
      this.url("/docs/search"),
      {
        method: "POST",
        headers: await this.headers(),
        body: JSON.stringify({
          select: CHUNK_FIELDS.join(","),
          top: query.top,
          filter: permissionFilter(query.allowedGroups),
          vectorQueries: [
            {
              kind: "vector",
              vector: query.vector,
              k: query.top,
              fields: VECTOR_FIELD,
            },
          ],
        }),
      },
      "Searching",
    );
    const value = ((await response.json()) as { value?: unknown }).value;
    if (!Array.isArray(value)) {
      throw new Error('Search response has no "value" array');
    }
    return value.map(toSearchHit);
  }

  /** URL of this index, or of a path below it such as "/docs/search". */
  private url(path: string): string {
    return indexUrl(this.options.endpoint, this.options.indexName, path);
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      Authorization: await bearer(this.options.credential, TOKEN_SCOPE),
      "Content-Type": "application/json",
    };
  }
}

export function indexUrl(
  endpoint: string,
  indexName: string,
  path: string,
): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/indexes/${encodeURIComponent(indexName)}${path}?api-version=${API_VERSION}`;
}

/**
 * The index schema. Notes on the less obvious settings:
 * - `filterable` on ticker, fiscalYear and accessGroups lets queries narrow by
 *   company, year and permission.
 * - The vector field is not `retrievable` and not `stored`: search uses it,
 *   but results never need it back, and not storing a copy saves space.
 * - HNSW with cosine similarity is the standard setup for OpenAI embeddings.
 */
export function indexDefinition(name: string, dimensions: number): object {
  return {
    name,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "ticker", type: "Edm.String", filterable: true, facetable: true },
      { name: "company", type: "Edm.String" },
      {
        name: "fiscalYear",
        type: "Edm.Int32",
        filterable: true,
        facetable: true,
      },
      { name: "section", type: "Edm.String", searchable: true },
      { name: "text", type: "Edm.String", searchable: true },
      { name: "sourceUrl", type: "Edm.String" },
      {
        name: "accessGroups",
        type: "Collection(Edm.String)",
        filterable: true,
      },
      {
        name: VECTOR_FIELD,
        type: "Collection(Edm.Single)",
        searchable: true,
        retrievable: false,
        stored: false,
        dimensions,
        vectorSearchProfile: "default",
      },
    ],
    vectorSearch: {
      algorithms: [
        { name: "hnsw", kind: "hnsw", hnswParameters: { metric: "cosine" } },
      ],
      profiles: [{ name: "default", algorithm: "hnsw" }],
    },
  };
}

export function toSearchDocument(indexed: IndexedChunk): object {
  return {
    "@search.action": "mergeOrUpload",
    ...indexed.chunk,
    accessGroups: indexed.accessGroups,
    [VECTOR_FIELD]: indexed.vector,
  };
}

/**
 * OData filter keeping chunks shared with any of the caller's groups, e.g.
 * accessGroups/any(g: search.in(g, 'public,finance', ',')).
 * Group names are checked against a strict pattern first, because they are
 * pasted into the filter text: a name with a quote could otherwise change
 * the filter's meaning (the same risk as SQL injection).
 */
export function permissionFilter(groups: AccessGroup[]): string {
  for (const group of groups) {
    if (!/^[A-Za-z0-9_-]+$/.test(group)) {
      throw new Error(
        `Access group "${group}" may only use letters, digits, "-" and "_"`,
      );
    }
  }
  return `accessGroups/any(g: search.in(g, '${groups.join(",")}', ','))`;
}

/** Keys of documents the upload response reports as failed. */
export function failedKeys(json: unknown): string[] {
  const value = (json as { value?: unknown } | null)?.value;
  if (!Array.isArray(value)) {
    throw new Error('Upload response has no "value" array');
  }
  return (
    value as Array<{ key?: unknown; status?: unknown; errorMessage?: unknown }>
  )
    .filter((item) => item.status !== true)
    .map((item) => `${String(item.key)} (${String(item.errorMessage)})`);
}

/** Translates one search result back into the project's types. */
export function toSearchHit(document: unknown): SearchHit {
  const record = document as Record<string, unknown>;
  const text = (name: string): string => {
    const value = record[name];
    if (typeof value !== "string") {
      throw new Error(`Search result is missing ${name}`);
    }
    return value;
  };
  const score = record["@search.score"];
  const fiscalYear = record.fiscalYear;
  if (typeof score !== "number" || typeof fiscalYear !== "number") {
    throw new Error("Search result is missing @search.score or fiscalYear");
  }
  const chunk: Chunk = {
    id: text("id"),
    ticker: text("ticker"),
    company: text("company"),
    fiscalYear,
    section: text("section"),
    text: text("text"),
    sourceUrl: text("sourceUrl"),
  };
  return { chunk, score };
}
