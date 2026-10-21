import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chatCompletionsUrl, readReply } from "./foundry-chat-model";

describe("chatCompletionsUrl", () => {
  it("uses the v1 chat completions path", () => {
    assert.equal(
      chatCompletionsUrl("https://example.openai.azure.com/"),
      "https://example.openai.azure.com/openai/v1/chat/completions",
    );
  });
});

describe("readReply", () => {
  it("returns the first choice's text", () => {
    const json = {
      choices: [{ finish_reason: "stop", message: { content: "Hello [1]." } }],
    };
    assert.equal(readReply(json), "Hello [1].");
  });

  it("fails when the reply was cut off", () => {
    const json = {
      choices: [{ finish_reason: "length", message: { content: "Partial" } }],
    };
    assert.throws(() => readReply(json), /cut off/);
  });

  it("fails when there is no text", () => {
    assert.throws(() => readReply({ choices: [] }), /no choices/);
    assert.throws(
      () =>
        readReply({
          choices: [{ finish_reason: "content_filter", message: {} }],
        }),
      /no text \(finish_reason: content_filter\)/,
    );
  });
});
