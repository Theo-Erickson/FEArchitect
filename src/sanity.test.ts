import { test } from "node:test";
import assert from "node:assert/strict";

// This proves Node 24 executes .test.ts files directly with no build step.
test("node runs typescript tests", () => {
  const doubled: number = 2 * 21;
  assert.equal(doubled, 42);
});
