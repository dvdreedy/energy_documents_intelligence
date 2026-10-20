/**
 * The only place that builds adapters and hands them to the core.
 * Plain constructors, no dependency-injection framework (docs/adr/0001-architecture.md).
 */
import path from "node:path";
import { DefaultAzureCredential } from "@azure/identity";
import { DocumentIntelligenceParser } from "./adapters/docintel/document-intelligence-parser";
import { ManifestFilingCatalog } from "./adapters/fs/manifest-catalog";
import type { Config } from "./config";
import type { DocumentParser, FilingCatalog } from "./core/ports";

export const RAW_DIR = path.join("data", "raw");
export const PARSED_DIR = path.join("data", "parsed");

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
