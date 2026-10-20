/**
 * DocumentParser backed by Azure Document Intelligence's prebuilt-layout model.
 *
 * Calls the REST API directly with fetch instead of the SDK: it is two HTTP
 * calls (submit, then poll), and seeing them in plain code is easier to explain
 * than an SDK poller. Access is keyless: an Entra ID token from TokenCredential.
 *
 * Parsing is billed per page, so every result is saved to cacheDir and reused.
 * Each filing is paid for once, and the cache keeps the full response (tables,
 * paragraphs, sections) for layout-aware chunking later.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { TokenCredential } from "@azure/identity";
import type { DocumentParser } from "../../core/ports";
import type { Filing, ParsedDocument } from "../../core/types";

const API_VERSION = "2024-11-30";
const MODEL = "prebuilt-layout";
const TOKEN_SCOPE = "https://cognitiveservices.azure.com/.default";
const DEFAULT_POLL_MS = 2_000;
const TIMEOUT_MS = 10 * 60_000;

export interface DocumentIntelligenceParserOptions {
  endpoint: string;
  credential: TokenCredential;
  cacheDir: string;
}

export class DocumentIntelligenceParser implements DocumentParser {
  constructor(private readonly options: DocumentIntelligenceParserOptions) {}

  async parse(filing: Filing): Promise<ParsedDocument> {
    const cacheFile = cacheFileFor(filing, this.options.cacheDir);
    let response = await readCache(cacheFile);
    if (response === undefined) {
      response = await this.analyze(filing);
      await writeCache(cacheFile, response);
    }
    return toParsedDocument(filing, response);
  }

  /** Submits the HTML, then polls until the analysis finishes. Returns the final JSON. */
  private async analyze(filing: Filing): Promise<unknown> {
    const html = await readFile(filing.file);
    const submit = await fetch(analyzeUrl(this.options.endpoint), {
      method: "POST",
      headers: {
        Authorization: await this.authorization(),
        "Content-Type": "text/html",
      },
      body: html,
    });
    if (submit.status !== 202) {
      throw new Error(
        `Document Intelligence rejected ${filing.file}: ${submit.status} ${await submit.text()}`,
      );
    }
    const operationUrl = submit.headers.get("operation-location");
    if (!operationUrl) {
      throw new Error("Document Intelligence returned no Operation-Location");
    }

    const deadline = Date.now() + TIMEOUT_MS;
    let waitMs = retryAfterMs(submit.headers.get("retry-after"));
    while (Date.now() < deadline) {
      await sleep(waitMs);
      const poll = await fetch(operationUrl, {
        headers: { Authorization: await this.authorization() },
      });
      if (!poll.ok) {
        throw new Error(
          `Polling ${filing.file} failed: ${poll.status} ${await poll.text()}`,
        );
      }
      const json: unknown = await poll.json();
      const status = operationStatus(json);
      if (status === "succeeded") return json;
      if (status === "failed" || status === "canceled") {
        throw new Error(
          `Analysis of ${filing.file} ${status}: ${JSON.stringify(json)}`,
        );
      }
      waitMs = retryAfterMs(poll.headers.get("retry-after"));
    }
    throw new Error(
      `Analysis of ${filing.file} did not finish in ${TIMEOUT_MS / 60_000} minutes`,
    );
  }

  /** The credential caches tokens, so asking on every request is cheap. */
  private async authorization(): Promise<string> {
    const token = await this.options.credential.getToken(TOKEN_SCOPE);
    if (!token) {
      throw new Error(`Could not get an Entra ID token for ${TOKEN_SCOPE}`);
    }
    return `Bearer ${token.token}`;
  }
}

export function analyzeUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return `${base}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}&outputContentFormat=markdown`;
}

/** data/raw/HAL-2024-10k.htm -> <cacheDir>/HAL-2024-10k.layout.json */
export function cacheFileFor(filing: Filing, cacheDir: string): string {
  return path.join(
    cacheDir,
    `${path.basename(filing.file, path.extname(filing.file))}.layout.json`,
  );
}

/** Retry-After is in seconds; fall back to a default when it is missing or odd. */
export function retryAfterMs(header: string | null): number {
  const seconds = Number(header);
  return header !== null && Number.isFinite(seconds) && seconds > 0
    ? seconds * 1000
    : DEFAULT_POLL_MS;
}

export function operationStatus(json: unknown): string {
  const status = (json as { status?: unknown } | null)?.status;
  if (typeof status !== "string") {
    throw new Error("Document Intelligence response has no status");
  }
  return status;
}

/** Translates a finished analyze response into the project's ParsedDocument. */
export function toParsedDocument(
  filing: Filing,
  response: unknown,
): ParsedDocument {
  if (operationStatus(response) !== "succeeded") {
    throw new Error(`Analysis of ${filing.file} has not succeeded`);
  }
  const content = (response as { analyzeResult?: { content?: unknown } })
    .analyzeResult?.content;
  if (typeof content !== "string") {
    throw new Error(`Analysis of ${filing.file} has no analyzeResult.content`);
  }
  return { filing, markdown: content };
}

async function readCache(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  return JSON.parse(text);
}

/** Temp file then rename, so an interrupted write never leaves a broken cache entry. */
async function writeCache(file: string, response: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const partial = `${file}.part`;
  await writeFile(partial, JSON.stringify(response));
  await rename(partial, file);
}
