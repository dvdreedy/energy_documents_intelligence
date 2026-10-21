/**
 * Reads settings from .env (or the environment) and validates them.
 * The core never reads process.env; settings are passed in from here.
 */

export interface Config {
  docIntelEndpoint: string;
  searchEndpoint: string;
  searchIndex: string;
  openAiEndpoint: string;
  embeddingDeployment: string;
  chatDeployment: string;
}

/** Loads .env into process.env if the file exists, then parses the settings. */
export function loadConfig(): Config {
  try {
    process.loadEnvFile();
  } catch (error) {
    // No .env file is fine; the variables can also come from the environment.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return parseConfig(process.env);
}

/** Pure, so it can be tested without touching the real environment. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  return {
    docIntelEndpoint: httpsUrl(env, "AZURE_DOCINTEL_ENDPOINT"),
    searchEndpoint: httpsUrl(env, "AZURE_SEARCH_ENDPOINT"),
    searchIndex: required(env, "AZURE_SEARCH_INDEX"),
    openAiEndpoint: httpsUrl(env, "AZURE_OPENAI_ENDPOINT"),
    embeddingDeployment: required(env, "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
    chatDeployment: required(env, "AZURE_OPENAI_CHAT_DEPLOYMENT"),
  };
}

function required(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} in .env (see .env.example)`);
  }
  return value;
}

function httpsUrl(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = required(env, name);
  if (!URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new Error(`${name} must be an https:// URL, got "${value}"`);
  }
  return value;
}
