/**
 * Parses downloaded filings with Azure Document Intelligence into data/parsed/.
 *
 * Usage:
 *   npm run parse -- --ticker HAL --year 2024
 *   npm run parse -- --confirm            (all filings)
 *
 * Parsing is billed per page (about $10 per 1,000), so filings that are not in
 * data/parsed/ yet are only sent when --confirm is given. Cached ones are free.
 * Needs the Azure settings in .env and `az login`.
 */
import { createParsing } from "../src/composition";
import { loadConfig } from "../src/config";
import { chunkDocument } from "../src/core/chunking";
import { parseFilings, selectFilings } from "../src/core/parse-filings";
import { readCommonArgs, uncachedFilings } from "./shared";

async function main(): Promise<void> {
  const { selection, confirm } = readCommonArgs();
  const { catalog, parser } = createParsing(loadConfig());

  // Cost guard: list what would be billed before sending anything.
  const uncached = await uncachedFilings(
    selectFilings(await catalog.list(), selection),
  );
  if (uncached.length > 0 && !confirm) {
    console.log("Not parsed yet (would be billed by Document Intelligence):");
    for (const filing of uncached) console.log(`  ${filing.file}`);
    console.log("Rerun with --confirm to parse them.");
    process.exitCode = 1;
    return;
  }

  await parseFilings(catalog, parser, selection, (document) => {
    const { ticker, fiscalYear } = document.filing;
    // Chunk right away so chunk counts and sizes can be checked before indexing.
    const chunks = chunkDocument(document);
    const sections = new Set(chunks.map((c) => c.section)).size;
    const characters = chunks.reduce((n, c) => n + c.text.length, 0);
    console.log(
      `${ticker} ${fiscalYear}: ${document.markdown.length.toLocaleString()} characters of Markdown -> ` +
        `${chunks.length} chunks in ${sections} sections, ${characters.toLocaleString()} characters after cleanup`,
    );
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
