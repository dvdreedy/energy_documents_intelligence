/**
 * Use case: answer a question from the filings, with citations (roadmap step 1,
 * the naive version). Retrieve the closest chunks, give them to the model as
 * numbered sources, and ask it to answer only from them, citing [n] for each
 * fact. Refusing on low retrieval confidence comes in step 4; for now the
 * model is told to say so when the sources do not contain the answer.
 */
import type { ChatModel, Embedder, SearchIndex } from "./ports";
import type {
  AccessGroup,
  Answer,
  Chunk,
  ChatMessage,
  Citation,
  SearchHit,
} from "./types";

/** How many chunks to give the model. About 2,500 tokens of sources. */
export const DEFAULT_TOP = 5;

/** The exact reply the model is told to give when the sources lack the answer. */
export const NOT_FOUND_ANSWER =
  "The filings I searched do not answer this question.";

export const SYSTEM_PROMPT = `You answer questions about companies' SEC Form 10-K annual reports, using only the numbered sources you are given.

Rules:
- Use only facts stated in the sources. Do not use outside knowledge.
- After each sentence that uses a source, cite it with its number in square brackets, like [1]. Cite several sources as [1][3].
- Quote figures exactly as the source writes them, with units and the period they cover.
- If the sources do not contain the answer, reply exactly: "${NOT_FOUND_ANSWER}" and nothing else.
- Be concise: a few sentences.`;

export interface AnswerPorts {
  embedder: Embedder;
  index: SearchIndex;
  chat: ChatModel;
}

export interface AskOptions {
  /** The asker's groups; only chunks shared with one of them can be used. */
  allowedGroups: AccessGroup[];
  top?: number;
}

export async function askQuestion(
  ports: AnswerPorts,
  question: string,
  options: AskOptions,
): Promise<Answer> {
  const trimmed = question.trim();
  if (trimmed === "") {
    throw new Error("The question is empty");
  }

  const [vector] = await ports.embedder.embed([trimmed]);
  if (vector === undefined) {
    throw new Error("The embedder returned no vector for the question");
  }
  const hits = await ports.index.search({
    vector,
    top: options.top ?? DEFAULT_TOP,
    allowedGroups: options.allowedGroups,
  });
  // Nothing the asker may see: no point calling the model.
  if (hits.length === 0) {
    return { text: NOT_FOUND_ANSWER, citations: [] };
  }

  const reply = await ports.chat.complete(buildMessages(trimmed, hits));
  return { text: reply.trim(), citations: extractCitations(reply, hits) };
}

/** "HALLIBURTON CO (HAL) FY2024 Form 10-K, Item 7. Management’s Discussion…" */
export function sourceLabel(chunk: Chunk): string {
  return `${chunk.company} (${chunk.ticker}) FY${chunk.fiscalYear} Form 10-K, ${chunk.section}`;
}

/** The system prompt, then one user message holding the numbered sources and the question. */
export function buildMessages(
  question: string,
  hits: SearchHit[],
): ChatMessage[] {
  const sources = hits
    .map((hit, i) => `[${i + 1}] ${sourceLabel(hit.chunk)}\n${hit.chunk.text}`)
    .join("\n\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Sources:\n\n${sources}\n\nQuestion: ${question}`,
    },
  ];
}

/**
 * Finds the [n] markers in the reply and maps them back to the sources, in
 * order of first mention. Also accepts "[1, 3]". Markers that point at no
 * source (a model mistake) are ignored rather than shown as fake citations.
 */
export function extractCitations(reply: string, hits: SearchHit[]): Citation[] {
  const citations: Citation[] = [];
  const seen = new Set<number>();
  for (const match of reply.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const marker = Number(part.trim());
      const hit = hits[marker - 1];
      if (hit === undefined || seen.has(marker)) continue;
      seen.add(marker);
      const { chunk } = hit;
      citations.push({
        marker,
        chunkId: chunk.id,
        company: chunk.company,
        ticker: chunk.ticker,
        fiscalYear: chunk.fiscalYear,
        section: chunk.section,
        sourceUrl: chunk.sourceUrl,
      });
    }
  }
  return citations;
}

/** The answer as plain text, followed by the list of cited sources. */
export function formatAnswer(answer: Answer): string {
  if (answer.citations.length === 0) return answer.text;
  const sources = answer.citations.map(
    (c) =>
      `[${c.marker}] ${c.company} (${c.ticker}) FY${c.fiscalYear} Form 10-K, ${c.section}\n    ${c.sourceUrl}`,
  );
  return `${answer.text}\n\nSources:\n${sources.join("\n")}`;
}
