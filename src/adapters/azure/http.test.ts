import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retryDelayMs } from "./http";

describe("retryDelayMs", () => {
  it("uses Retry-After when Azure sends it", () => {
    assert.equal(retryDelayMs("7", 1), 7000);
  });

  it("backs off exponentially without a usable header", () => {
    assert.equal(retryDelayMs(null, 1), 2000);
    assert.equal(retryDelayMs("soon", 2), 4000);
    assert.equal(retryDelayMs("0", 3), 8000);
  });
});
