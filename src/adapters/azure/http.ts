/**
 * Small helpers shared by the Azure REST adapters: an Entra ID bearer token,
 * and fetch with retries when Azure says to slow down.
 */
import { setTimeout as sleep } from "node:timers/promises";
import type { TokenCredential } from "@azure/identity";

const MAX_ATTEMPTS = 6;
const RETRY_STATUSES = new Set([429, 503]);

/** The credential caches tokens, so asking on every request is cheap. */
export async function bearer(
  credential: TokenCredential,
  scope: string,
): Promise<string> {
  const token = await credential.getToken(scope);
  if (!token) {
    throw new Error(`Could not get an Entra ID token for ${scope}`);
  }
  return `Bearer ${token.token}`;
}

/**
 * fetch that retries 429 (too many requests) and 503 (busy), waiting as long
 * as Azure's Retry-After header asks, or backing off 2s, 4s, 8s… without one.
 * Any other failure throws with the response body, which says what was wrong.
 * `label` names the call in error messages, e.g. "Embedding 32 texts".
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  label: string,
): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;
    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `${label} failed: ${response.status} ${await response.text()}`,
      );
    }
    await sleep(retryDelayMs(response.headers.get("retry-after"), attempt));
  }
}

/** Retry-After in seconds if present and valid, otherwise exponential backoff. */
export function retryDelayMs(header: string | null, attempt: number): number {
  const seconds = Number(header);
  if (header !== null && Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return 1000 * 2 ** attempt;
}
