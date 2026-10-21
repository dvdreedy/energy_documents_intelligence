import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseConfig } from "./config";

const env = {
  AZURE_DOCINTEL_ENDPOINT: " https://di.example.com/ ",
  AZURE_SEARCH_ENDPOINT: "https://search.example.com",
  AZURE_SEARCH_INDEX: "filings-v1",
  AZURE_OPENAI_ENDPOINT: "https://aif.example.com/",
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "text-embedding-3-small",
};

describe("parseConfig", () => {
  it("reads and trims every setting", () => {
    assert.deepEqual(parseConfig(env), {
      docIntelEndpoint: "https://di.example.com/",
      searchEndpoint: "https://search.example.com",
      searchIndex: "filings-v1",
      openAiEndpoint: "https://aif.example.com/",
      embeddingDeployment: "text-embedding-3-small",
    });
  });

  it("says which variable is missing", () => {
    assert.throws(
      () => parseConfig({ ...env, AZURE_SEARCH_INDEX: " " }),
      /Set AZURE_SEARCH_INDEX/,
    );
  });

  it("rejects an endpoint that is not an https URL", () => {
    assert.throws(
      () => parseConfig({ ...env, AZURE_DOCINTEL_ENDPOINT: "example.com" }),
      /AZURE_DOCINTEL_ENDPOINT must be an https:\/\/ URL/,
    );
    assert.throws(
      () =>
        parseConfig({ ...env, AZURE_SEARCH_ENDPOINT: "http://example.com" }),
      /AZURE_SEARCH_ENDPOINT must be an https:\/\/ URL/,
    );
  });
});
