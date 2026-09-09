import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBundle } from "./datagen.ts";

test("loads and resolves the baseline encounter", async () => {
  const bundle = await loadBundle("encounters/duel-01.json");
  assert.equal(bundle.encounter.id, "duel-01");
  assert.equal(bundle.player.unit.name, "Eirika");
  assert.equal(bundle.player.weapon.name, "Iron Sword");
  assert.equal(bundle.enemy.unit.name, "Wyvern Rider");
  assert.equal(bundle.enemy.weapon.type, "lance");
});

test("a missing weapon reference fails loudly", async () => {
  await assert.rejects(
    () => loadBundle("encounters/duel-01.json", {
      unitsPath: "data/units.json",
      weaponsPath: "data/units.json", // wrong file on purpose: no weapon keys
    }),
    /weapon/i,
  );
});

test("a malformed unit fails validation", async () => {
  await assert.rejects(
    () => loadBundle("src/datagen.test.ts"), // not an encounter at all
    /encounter|unit|weapon|json|parse/i,
  );
});
