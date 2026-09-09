import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreview } from "./combatpreview.ts";
import { formatPreview } from "./format.ts";
import { loadBundle } from "./datagen.ts";

test("formatted preview mentions both fighters and key numbers", async () => {
  const bundle = await loadBundle("encounters/duel-01.json");
  const result = buildPreview(bundle, { seed: 42, runs: 500 });
  const text = formatPreview(bundle, result);
  assert.match(text, /Eirika/);
  assert.match(text, /Wyvern Rider/);
  assert.match(text, /win rate/i);
  assert.match(text, /seed/i);
});
