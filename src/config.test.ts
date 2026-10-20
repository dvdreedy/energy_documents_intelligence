import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("reads the Document Intelligence endpoint", () => {
    const config = parseConfig({
      AZURE_DOCINTEL_ENDPOINT: " https://example.cognitiveservices.azure.com/ ",
    });
    assert.equal(
      config.docIntelEndpoint,
      "https://example.cognitiveservices.azure.com/",
    );
  });

  it("says which variable is missing", () => {
    assert.throws(() => parseConfig({}), /Set AZURE_DOCINTEL_ENDPOINT/);
  });

  it("rejects a value that is not an https URL", () => {
    assert.throws(
      () => parseConfig({ AZURE_DOCINTEL_ENDPOINT: "example.com" }),
      /must be an https:\/\/ URL/,
    );
    assert.throws(
      () => parseConfig({ AZURE_DOCINTEL_ENDPOINT: "http://example.com" }),
      /must be an https:\/\/ URL/,
    );
  });
});
