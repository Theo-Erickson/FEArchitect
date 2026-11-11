import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarioSources, normalizeScenario, scenarioIndex, isFe8Map, CLASS_PATHS } from "./scenariosrc.ts";

test("scenarioSources: a custom map reads data/terrain.json and maps/<id>.json", () => {
  assert.deepEqual(scenarioSources({ map: "showcase-terrain" }), {
    fe8: false, terrainPath: "data/terrain.json", mapPath: "maps/showcase-terrain.json",
  });
});

test("scenarioSources: an fe8- map reads the FE8 terrain and chapter grid", () => {
  const want = { fe8: true, terrainPath: "assets/reference/fe8/terrain.json", mapPath: "assets/reference/fe8/terrain/12.json" };
  assert.deepEqual(scenarioSources({ map: "fe8-12" }), want);
  assert.deepEqual(scenarioSources({ map: "fe8-12", terrain: "fe8" }), want);
});

test("scenarioSources: terrain fe8 with a bare chapter number still works", () => {
  assert.equal(scenarioSources({ map: "3", terrain: "fe8" }).mapPath, "assets/reference/fe8/terrain/3.json");
});

test("scenarioSources rejects a missing map", () => {
  assert.throws(() => scenarioSources({}), /map/);
});

test("isFe8Map and CLASS_PATHS", () => {
  assert.equal(isFe8Map("fe8-1"), true);
  assert.equal(isFe8Map("forest-hills"), false);
  assert.deepEqual(CLASS_PATHS, { fe8: "assets/reference/fe8/sim-classes.json", custom: "data/classes.json" });
});

test("normalizeScenario sets id, fe8 terrain, and assigns stable placement ids", () => {
  const out = normalizeScenario("ch", {
    id: "ignored", map: "fe8-2",
    units: [
      { unit: "soldier", weapon: "iron-lance", side: "enemy", at: [1, 1] },
      { id: "soldier", unit: "seth", weapon: "iron-lance", side: "player", at: [0, 0] },
      { unit: "soldier", weapon: "iron-lance", side: "enemy", at: [2, 1] },
    ],
  });
  assert.equal(out.id, "ch");
  assert.equal(out.terrain, "fe8");
  // The explicit id "soldier" is reserved first, so generated ids skip it.
  assert.deepEqual(out.units.map((u: any) => u.id), ["soldier-2", "soldier", "soldier-3"]);
});

test("normalizeScenario keeps custom maps without a terrain field and does not mutate input", () => {
  const spec = { map: "showcase-terrain", units: [{ unit: "seth", weapon: "iron-lance", side: "player", at: [0, 0] }] };
  const out = normalizeScenario("s", spec);
  assert.equal(out.terrain, undefined);
  assert.equal(out.units[0].id, "seth");
  assert.equal((spec.units[0] as any).id, undefined);
});

test("normalizeScenario rejects a spec without a units list", () => {
  assert.throws(() => normalizeScenario("s", { map: "x" }), /units list/);
});

test("scenarioIndex lists only multi-unit scenarios, sorted by id", () => {
  const idx = scenarioIndex([
    { file: "zeta.json", json: { map: "m", units: [], notes: "last" } },
    { file: "duel-01.json", json: { player: {}, enemy: {} } },
    { file: "alpha.json", json: { map: "fe8-1", units: [] } },
    { file: "alpha.json.tmp", json: { units: [] } },
  ]);
  assert.deepEqual(idx, [
    { id: "alpha", map: "fe8-1", notes: "" },
    { id: "zeta", map: "m", notes: "last" },
  ]);
});
