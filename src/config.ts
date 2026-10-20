/**
 * Reads settings from .env (or the environment) and validates them.
 * The core never reads process.env; settings are passed in from here.
 */

export interface Config {
  docIntelEndpoint: string;
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
  };
}

function httpsUrl(
  env: Record<string, string | undefined>,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} in .env (see .env.example)`);
  }
  if (!URL.canParse(value) || new URL(value).protocol !== "https:") {
    throw new Error(`${name} must be an https:// URL, got "${value}"`);
  }
  return value;
}
