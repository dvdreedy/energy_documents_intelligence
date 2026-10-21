/**
 * Chunks parsed filings, embeds the chunks with Foundry and uploads them to
 * the Azure AI Search index (creating the index if it does not exist).
 *
 * Usage:
 *   npm run ingest                      dry run: counts, estimated cost and size
 *   npm run ingest -- --confirm         embed and upload all filings
 *   npm run ingest -- --ticker HAL --year 2024 --confirm
 *
 * Only filings already in data/parsed/ are used, so this never pays for
 * parsing; run npm run parse first. Rerunning replaces chunks by id.
 */
import { EMBEDDING_DIMENSIONS, createIngestion } from "../src/composition";
import { loadConfig } from "../src/config";
import { chunkDocument } from "../src/core/chunking";
import {
  embeddingText,
  ingestFilings,
  type IngestPorts,
} from "../src/core/ingest";
import {
  parseFilings,
  selectFilings,
  type FilingSelection,
} from "../src/core/parse-filings";
import { readCommonArgs, uncachedFilings } from "./shared";

// text-embedding-3-small list price, in US dollars per million tokens.
const EMBEDDING_USD_PER_MILLION_TOKENS = 0.02;
// A rough rule for English text with OpenAI tokenizers.
const CHARACTERS_PER_TOKEN = 4;
// The Free Search tier's storage limit, in megabytes.
const FREE_TIER_MB = 50;

async function main(): Promise<void> {
  const { selection, confirm } = readCommonArgs();
  const config = loadConfig();
  const ports = createIngestion(config);

  const uncached = await uncachedFilings(
    selectFilings(await ports.catalog.list(), selection),
  );
  if (uncached.length > 0) {
    throw new Error(
      `Parse these filings first (npm run parse): ${uncached.map((f) => f.file).join(", ")}`,
    );
  }

  if (!confirm) {
    await dryRun(ports, selection);
    console.log(
      `\nRerun with --confirm to create index "${config.searchIndex}" if needed, embed and upload.`,
    );
    return;
  }

  const total = await ingestFilings(ports, selection, (p) =>
    console.log(`${p.ticker} ${p.fiscalYear}: ${p.chunks} chunks indexed`),
  );
  console.log(`Done: ${total} chunks in index "${config.searchIndex}".`);
}

/** Chunks locally (free) and prints what --confirm would do and cost. */
async function dryRun(
  ports: IngestPorts,
  selection: FilingSelection,
): Promise<void> {
  let chunks = 0;
  let characters = 0;
  await parseFilings(ports.catalog, ports.parser, selection, (document) => {
    const documentChunks = chunkDocument(document);
    chunks += documentChunks.length;
    characters += documentChunks.reduce(
      (n, c) => n + embeddingText(c).length,
      0,
    );
  });
  const tokens = characters / CHARACTERS_PER_TOKEN;
  const usd = (tokens / 1_000_000) * EMBEDDING_USD_PER_MILLION_TOKENS;
  // Each vector is 4 bytes per dimension; the text is stored once as well.
  const megabytes =
    (chunks * EMBEDDING_DIMENSIONS * 4 + characters) / 1_000_000;
  console.log(`Chunks to embed and upload: ${chunks.toLocaleString()}`);
  console.log(
    `Estimated embedding tokens: ${Math.round(tokens).toLocaleString()} (about $${usd.toFixed(2)})`,
  );
  console.log(
    `Estimated index size: ${megabytes.toFixed(1)} MB of the Free tier's ${FREE_TIER_MB} MB`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
