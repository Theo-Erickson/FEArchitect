import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMap } from "./resolve.ts";

const defs: any = {
  "1": { name: "Plains", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 } },
  "12": { name: "Forest", avoid: 20, def: 1, moveCost: { foot: 2, cav: 3, fly: 1 } },
};

test("resolveMap reads the chapter grid (terrainIds) format", () => {
  const m = resolveMap({ id: "fe8-1", width: 2, height: 1, terrainIds: [[1, 12]] }, defs);
  assert.deepEqual(m.terrain, [["1", "12"]]);
  assert.equal(m.width, 2);
  assert.equal(m.height, 1);
});

test("resolveMap still reads the ASCII legend format", () => {
  const m = resolveMap({ id: "s", legend: { ".": "1", "f": "12" }, tiles: [".f"] }, defs);
  assert.deepEqual(m.terrain, [["1", "12"]]);
});

test("resolveMap rejects an unknown terrain id in a grid", () => {
  assert.throws(() => resolveMap({ id: "x", width: 1, height: 1, terrainIds: [[99]] }, defs), /unknown terrain/);
});
