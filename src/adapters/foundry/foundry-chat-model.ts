/**
 * ChatModel backed by a gpt-5-mini deployment in Microsoft Foundry, called
 * through the OpenAI-compatible v1 chat completions API with an Entra ID token.
 *
 * gpt-5-mini is a reasoning model: it thinks before replying, and those
 * hidden reasoning tokens count toward max_completion_tokens and the bill.
 * `reasoning_effort: "low"` keeps that short, which suits answering from a
 * handful of given sources. Reasoning models do not accept `temperature`.
 */
import type { TokenCredential } from "@azure/identity";
import type { ChatModel } from "../../core/ports";
import type { ChatMessage } from "../../core/types";
import { bearer, fetchWithRetry } from "../azure/http";

const TOKEN_SCOPE = "https://ai.azure.com/.default";
/** Room for reasoning plus a few paragraphs of answer. */
const MAX_COMPLETION_TOKENS = 4000;

export interface FoundryChatModelOptions {
  endpoint: string;
  deployment: string;
  credential: TokenCredential;
}

export class FoundryChatModel implements ChatModel {
  constructor(private readonly options: FoundryChatModelOptions) {}

  async complete(messages: ChatMessage[]): Promise<string> {
    const response = await fetchWithRetry(
      chatCompletionsUrl(this.options.endpoint),
      {
        method: "POST",
        headers: {
          Authorization: await bearer(this.options.credential, TOKEN_SCOPE),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.options.deployment,
          messages,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
          reasoning_effort: "low",
        }),
      },
      `Chat completion with ${this.options.deployment}`,
    );
    return readReply(await response.json());
  }
}

export function chatCompletionsUrl(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/openai/v1/chat/completions`;
}

/**
 * Takes the first choice's text. Fails when the model ran out of tokens
 * ("length"), because a cut-off answer could drop a caveat or a citation.
 */
export function readReply(json: unknown): string {
  const choice = (
    json as {
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown };
      }>;
    } | null
  )?.choices?.[0];
  if (choice === undefined) {
    throw new Error("Chat response has no choices");
  }
  if (choice.finish_reason === "length") {
    throw new Error(
      `Chat reply was cut off at ${MAX_COMPLETION_TOKENS} tokens`,
    );
  }
  const content = choice.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error(
      `Chat response has no text (finish_reason: ${String(choice.finish_reason)})`,
    );
  }
  return content;
}
