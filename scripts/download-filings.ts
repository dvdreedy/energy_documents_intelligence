/**
 * Downloads the most recent 10-K filings for the project's companies from
 * SEC EDGAR into data/raw/, plus data/raw/manifest.json, which ingestion reads
 * for each filing's metadata and source link.
 *
 * Usage: npm run download
 *
 * Needs SEC_USER_AGENT in .env (your name and email). The SEC rejects
 * requests that don't identify who is making them.
 * Safe to rerun: filings already on disk are skipped.
 */
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  ANNUAL_REPORT_FORM,
  documentUrl,
  findCompany,
  fiscalYear,
  latestAnnualReports,
  rawFileName,
  submissionsUrl,
  type CompanyTicker,
  type FilingRef,
  type RecentFilings,
} from "../src/adapters/edgar/filings";

const TICKERS = ["CVX", "HAL", "PWR", "KMI"];
const FILINGS_PER_COMPANY = 2;
const RAW_DIR = path.join("data", "raw");
const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
// The SEC allows 10 requests per second. Pausing between requests keeps us well under that.
const REQUEST_DELAY_MS = 200;

interface Submissions {
  filings: { recent: RecentFilings };
}

interface ManifestEntry extends FilingRef {
  ticker: string;
  company: string;
  cik: number;
  form: string;
  fiscalYear: number;
  sourceUrl: string;
  file: string;
}

function loadUserAgent(): string {
  try {
    process.loadEnvFile();
  } catch (error) {
    // No .env file is fine; the variable can also come from the environment.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const userAgent = process.env.SEC_USER_AGENT?.trim();
  if (!userAgent) {
    throw new Error(
      'Set SEC_USER_AGENT in .env, e.g. SEC_USER_AGENT="Your Name you@example.com". The SEC rejects requests without it.',
    );
  }
  return userAgent;
}

async function get(url: string, userAgent: string): Promise<Response> {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok) {
    throw new Error(
      `GET ${url} failed: ${response.status} ${response.statusText}`,
    );
  }
  await sleep(REQUEST_DELAY_MS);
  return response;
}

async function getJson<T>(url: string, userAgent: string): Promise<T> {
  return (await (await get(url, userAgent)).json()) as T;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Saves the bytes exactly as the SEC served them. Writes to a temp file first,
 * so an interrupted download never leaves a half-written file that a rerun would skip. */
async function download(
  url: string,
  file: string,
  userAgent: string,
): Promise<void> {
  const bytes = Buffer.from(await (await get(url, userAgent)).arrayBuffer());
  const partial = `${file}.part`;
  await writeFile(partial, bytes);
  await rename(partial, file);
}

async function main(): Promise<void> {
  const userAgent = loadUserAgent();
  await mkdir(RAW_DIR, { recursive: true });

  const tickers = await getJson<Record<string, CompanyTicker>>(
    TICKERS_URL,
    userAgent,
  );
  const manifest: ManifestEntry[] = [];
  let downloaded = 0;
  let skipped = 0;

  for (const ticker of TICKERS) {
    const company = findCompany(tickers, ticker);
    const submissions = await getJson<Submissions>(
      submissionsUrl(company.cik_str),
      userAgent,
    );
    const filings = latestAnnualReports(
      submissions.filings.recent,
      FILINGS_PER_COMPANY,
    );
    if (filings.length < FILINGS_PER_COMPANY) {
      console.warn(
        `${ticker}: found ${filings.length} of ${FILINGS_PER_COMPANY} 10-K filings`,
      );
    }

    for (const filing of filings) {
      const sourceUrl = documentUrl(
        company.cik_str,
        filing.accessionNumber,
        filing.primaryDocument,
      );
      const file = path.join(RAW_DIR, rawFileName(ticker, filing.reportDate));

      if (await exists(file)) {
        skipped++;
      } else {
        await download(sourceUrl, file, userAgent);
        downloaded++;
        console.log(`Downloaded ${file}`);
      }

      manifest.push({
        ticker,
        company: company.title,
        cik: company.cik_str,
        form: ANNUAL_REPORT_FORM,
        ...filing,
        fiscalYear: fiscalYear(filing.reportDate),
        sourceUrl,
        file,
      });
    }
  }

  const manifestFile = path.join(RAW_DIR, "manifest.json");
  await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `Done: ${downloaded} downloaded, ${skipped} already on disk. Manifest: ${manifestFile}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
