/**
 * Answers a question from the indexed filings, with cited sources.
 *
 * Usage:
 *   npm run ask -- "What was Halliburton's total revenue in 2024?"
 *   npm run ask -- --groups public,finance --top 8 "…"
 *
 * Each question makes one embedding call and one gpt-5-mini call: a fraction
 * of a cent. Needs the Azure settings in .env and `az login`.
 */
import { parseArgs } from "node:util";
import { createAnswering } from "../src/composition";
import { loadConfig } from "../src/config";
import { DEFAULT_TOP, askQuestion, formatAnswer } from "../src/core/answer";
import { PUBLIC_GROUP } from "../src/core/ingest";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      groups: { type: "string", default: PUBLIC_GROUP },
      top: { type: "string", default: String(DEFAULT_TOP) },
    },
  });
  const question = positionals.join(" ");
  if (question.trim() === "") {
    throw new Error('Usage: npm run ask -- "your question"');
  }
  const top = Number(values.top);
  if (!Number.isInteger(top) || top < 1) {
    throw new Error(
      `--top must be a positive whole number, got "${values.top}"`,
    );
  }
  const allowedGroups = values.groups
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g !== "");

  const answer = await askQuestion(createAnswering(loadConfig()), question, {
    allowedGroups,
    top,
  });
  console.log(formatAnswer(answer));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
