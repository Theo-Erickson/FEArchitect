import { test } from "node:test";
import assert from "node:assert/strict";
import { enterCost, isPassable, terrainMod } from "./terrain.ts";
import type { TerrainDef } from "./types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
  forest: { name: "Forest", moveCost: { foot: 2, cav: 3, fly: 1 }, avoid: 20, def: 1 },
  mountain: { name: "Mountain", moveCost: { foot: 3, cav: null, fly: 1 }, avoid: 30, def: 2 },
  water: { name: "Water", moveCost: { foot: null, cav: null, fly: 1 }, avoid: 0, def: 0 },
};

test("enterCost returns per-type cost or null", () => {
  assert.equal(enterCost(DEFS, "forest", "foot"), 2);
  assert.equal(enterCost(DEFS, "forest", "cav"), 3);
  assert.equal(enterCost(DEFS, "mountain", "cav"), null);
  assert.equal(enterCost(DEFS, "water", "fly"), 1);
});

test("isPassable reflects null cost", () => {
  assert.equal(isPassable(DEFS, "water", "foot"), false);
  assert.equal(isPassable(DEFS, "water", "fly"), true);
  assert.equal(isPassable(DEFS, "mountain", "cav"), false);
});

test("terrainMod returns avoid, def, res for ground and zeroed bonuses for fliers", () => {
  assert.deepEqual(terrainMod(DEFS, "forest"), { avoid: 20, def: 1, res: 0 });
  assert.deepEqual(terrainMod(DEFS, "plains"), { avoid: 0, def: 0, res: 0 });
  // A flier gets no terrain bonus when the def has no fly fields (showcase terrain).
  assert.deepEqual(terrainMod(DEFS, "forest", "fly"), { avoid: 0, def: 0, res: 0 });
});

test("unknown terrain id throws", () => {
  assert.throws(() => enterCost(DEFS, "lava", "foot"), /unknown terrain/i);
});
