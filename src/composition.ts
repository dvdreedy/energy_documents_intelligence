/**
 * The only place that builds adapters and hands them to the core.
 * Plain constructors, no dependency-injection framework (docs/adr/0001-architecture.md).
 */
import path from "node:path";
import { DefaultAzureCredential } from "@azure/identity";
import { DocumentIntelligenceParser } from "./adapters/docintel/document-intelligence-parser";
import { FoundryEmbedder } from "./adapters/foundry/foundry-embedder";
import { ManifestFilingCatalog } from "./adapters/fs/manifest-catalog";
import { AzureSearchIndex } from "./adapters/search/azure-search-index";
import type { Config } from "./config";
import type { IngestPorts } from "./core/ingest";
import type { DocumentParser, FilingCatalog } from "./core/ports";

export const RAW_DIR = path.join("data", "raw");
export const PARSED_DIR = path.join("data", "parsed");

/** 512 instead of 1,536 to fit the Free Search tier (see FoundryEmbedder). */
export const EMBEDDING_DIMENSIONS = 512;

export interface Parsing {
  catalog: FilingCatalog;
  parser: DocumentParser;
}

export function createParsing(config: Config): Parsing {
  return {
    catalog: new ManifestFilingCatalog(path.join(RAW_DIR, "manifest.json")),
    parser: new DocumentIntelligenceParser({
      endpoint: config.docIntelEndpoint,
      // Uses `az login` locally and a managed identity in Azure. No keys.
      credential: new DefaultAzureCredential(),
      cacheDir: PARSED_DIR,
    }),
  };
}

export function createIngestion(config: Config): IngestPorts {
  const credential = new DefaultAzureCredential();
  return {
    ...createParsing(config),
    embedder: new FoundryEmbedder({
      endpoint: config.openAiEndpoint,
      deployment: config.embeddingDeployment,
      dimensions: EMBEDDING_DIMENSIONS,
      credential,
    }),
    index: new AzureSearchIndex({
      endpoint: config.searchEndpoint,
      indexName: config.searchIndex,
      dimensions: EMBEDDING_DIMENSIONS,
      credential,
    }),
  };
}
