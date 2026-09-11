import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGridEncounter } from "./datagen.ts";

test("loads and resolves the skirmish encounter", async () => {
  const enc = await loadGridEncounter("encounters/skirmish-01.json");
  assert.equal(enc.id, "skirmish-01");
  assert.equal(enc.map.width, 11);
  assert.equal(enc.map.height, 7);
  assert.equal(enc.map.terrain[3][5], "mountain");
  assert.equal(enc.player.unit.name, "Eirika");
  assert.equal(enc.player.cls.movementType, "foot");
  assert.deepEqual(enc.player.pos, { x: 1, y: 3 });
  assert.equal(enc.player.hp, 24);
  assert.equal(enc.enemy.cls.movementType, "fly");
  assert.equal(enc.enemy.ai, "aggressive");
});

test("a bad map dir fails loudly", async () => {
  await assert.rejects(
    () => loadGridEncounter("encounters/skirmish-01.json", {
      mapsDir: "src/grid", // wrong dir: no such map file
    }),
    /map|read|json/i,
  );
});

test("an unknown class fails loudly", async () => {
  await assert.rejects(
    () => loadGridEncounter("encounters/skirmish-01.json", {
      classesPath: "data/terrain.json", // valid json, but no class keys
    }),
    /class/i,
  );
});
