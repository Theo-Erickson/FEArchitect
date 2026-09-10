import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReachable, findPath, tileKey } from "./movement.ts";
import type { TerrainDef, ResolvedMap, MovementType } from "./types.ts";

const DEFS: Record<string, TerrainDef> = {
  plains: { name: "Plains", moveCost: { foot: 1, cav: 1, fly: 1 }, avoid: 0, def: 0 },
  forest: { name: "Forest", moveCost: { foot: 2, cav: 3, fly: 1 }, avoid: 20, def: 1 },
  mountain: { name: "Mountain", moveCost: { foot: 3, cav: null, fly: 1 }, avoid: 30, def: 2 },
  water: { name: "Water", moveCost: { foot: null, cav: null, fly: 1 }, avoid: 0, def: 0 },
};

// Same layout as the showcase map. legend: .=plains f=forest ^=mountain ~=water
const ROWS = [
  ".....^...~.",
  "...ff^...~.",
  "...ff^...~.",
  "...ff^.....",
  "...ff^...~.",
  ".....^...~.",
  ".........~.",
];
const LEGEND: Record<string, string> = { ".": "plains", f: "forest", "^": "mountain", "~": "water" };
const MAP: ResolvedMap = {
  id: "test",
  width: 11,
  height: 7,
  terrain: ROWS.map((r) => [...r].map((c) => LEGEND[c])),
};

function reach(type: MovementType, move: number, blocked: string[] = []) {
  return computeReachable(MAP, DEFS, { movementType: type, move, from: { x: 1, y: 3 } }, new Set(blocked)).tiles;
}

test("foot is boxed in by forest and mountain", () => {
  const t = reach("foot", 5);
  assert.ok(t.has("4,3"));   // through forest: 1+2+2 = 5
  assert.ok(t.has("1,0"));   // up the open left column: 3
  assert.ok(!t.has("5,3"));  // mountain past forest costs 8
  assert.ok(!t.has("8,3"));  // far side of the river, unreachable
});

test("cavalry ranges wider on open ground but is walled by mountain and river", () => {
  const t = reach("cav", 7);
  assert.ok(t.has("4,0"));   // along the top: 6
  assert.ok(!t.has("5,3"));  // mountain impassable to cav
  assert.ok(!t.has("8,3"));  // cannot cross the river within budget
});

test("flying ignores terrain and crosses water and mountains", () => {
  const t = reach("fly", 7);
  assert.ok(t.has("5,3"));   // over the mountain, distance 4
  assert.ok(t.has("7,3"));   // distance 6
  assert.ok(t.has("8,3"));   // the bridge tile, distance 7
});

test("an occupied tile is not reachable", () => {
  const t = reach("fly", 7, ["7,3"]);
  assert.ok(!t.has("7,3"));
});

test("findPath returns a least-cost path or null", () => {
  const p = findPath(MAP, DEFS, { movementType: "fly", move: Infinity, from: { x: 1, y: 3 } }, { x: 7, y: 3 }, new Set());
  assert.ok(p);
  assert.equal(p!.cost, 6);
  assert.deepEqual(p!.path[0], { x: 1, y: 3 });
  assert.deepEqual(p!.path[p!.path.length - 1], { x: 7, y: 3 });

  // foot cannot enter water at all (col 9 is the river)
  const none = findPath(MAP, DEFS, { movementType: "foot", move: Infinity, from: { x: 1, y: 3 } }, { x: 9, y: 2 }, new Set());
  assert.equal(none, null);

  // a blocked destination yields null
  const blocked = findPath(MAP, DEFS, { movementType: "fly", move: Infinity, from: { x: 1, y: 3 } }, { x: 7, y: 3 }, new Set(["7,3"]));
  assert.equal(blocked, null);
});

test("tileKey formats coordinates", () => {
  assert.equal(tileKey({ x: 3, y: 4 }), "3,4");
});
