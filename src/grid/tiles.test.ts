import { test } from "node:test";
import assert from "node:assert/strict";
import { fe8IdFor, chooseChips, chipSource, type SheetData } from "./tiles.ts";
import type { ResolvedMap, TerrainDef } from "./types.ts";

const def = (fe8?: number[]): TerrainDef => ({ name: "t", avoid: 0, def: 0, moveCost: { foot: 1, cav: 1, fly: 1 }, fe8 });
const defs: Record<string, TerrainDef> = { plains: def([1]), forest: def([12]), water: def([17, 16]), odd: def() };
const map = (rows: string[][]): ResolvedMap => ({ id: "m", width: rows[0].length, height: rows.length, terrain: rows });

test("fe8IdFor picks the first candidate the sheet has", () => {
  assert.equal(fe8IdFor(defs.water, [1, 16]), 16);
  assert.equal(fe8IdFor(defs.water, [1, 16, 17]), 17);
  assert.equal(fe8IdFor(defs.odd, [1]), null);
  assert.equal(fe8IdFor(undefined, [1]), null);
});

test("chipSource maps a sheet position to pixel coords", () => {
  assert.deepEqual(chipSource(0), { sx: 0, sy: 0 });
  assert.deepEqual(chipSource(33), { sx: 16, sy: 16 });
});

test("the literal edge context is used when the edges-as-self key is unknown", () => {
  const sheet: SheetData = { terrains: [1, 12], contexts: { "1,-1,12,-1,-1": [[7, 3]], "1,1,1,1,1": [[8, 9]] }, freq: { "1": [[9, 99]] } };
  assert.deepEqual(chooseChips(map([["plains", "forest"]]), defs, sheet)[0][0], 7);
});

test("edges count as the same terrain first, before the literal edge context", () => {
  const sheet: SheetData = { terrains: [1], contexts: { "1,1,1,1,1": [[8, 2]], "1,-1,-1,-1,-1": [[5, 50]] }, freq: { "1": [[9, 99]] } };
  assert.deepEqual(chooseChips(map([["plains"]]), defs, sheet), [[8]]);
});

test("variation is weighted by count: a dominant chip wins most tiles", () => {
  const rows = Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => "plains"));
  const sheet: SheetData = { terrains: [1], contexts: {}, freq: { "1": [[1, 90], [2, 46]] } };
  const flat = chooseChips(map(rows), defs, sheet).flat();
  const ones = flat.filter((p) => p === 1).length;
  assert.ok(ones > 50 && ones < 85, `chip 1 on ${ones} of 100 tiles`); // ~66% expected
});

test("best partial context needs at least two matching neighbours, else frequency", () => {
  // cell (1,1) of a 3x3 plains field with forest to the east: key 1,1,12,1,1.
  const rows = [["plains", "plains", "plains"], ["plains", "plains", "forest"], ["plains", "plains", "plains"]];
  const partial: SheetData = { terrains: [1, 12], contexts: { "1,1,16,1,1": [[5, 4]], "1,12,12,12,12": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, partial)[1][1], 5); // n, s, w match (3); "1,12,12,12,12" only e (1)
  const two: SheetData = { terrains: [1, 12], contexts: { "1,12,12,12,1": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, two)[1][1], 6); // e and w match: 2 is enough
  const none: SheetData = { terrains: [1, 12], contexts: { "1,12,1,12,12": [[6, 50]] }, freq: { "1": [[9, 1]], "12": [[3, 1]] } };
  assert.equal(chooseChips(map(rows), defs, none)[1][1], 9); // no neighbour matches: falls to frequency
});

test("null when the terrain has no fe8 id on this sheet or no chips at all", () => {
  const sheet: SheetData = { terrains: [1], contexts: {}, freq: {} };
  assert.deepEqual(chooseChips(map([["plains", "odd", "water"]]), defs, sheet), [[null, null, null]]);
});

test("variation keeps chips with at least half the top count and is deterministic", () => {
  const rows = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => "plains"));
  const sheet: SheetData = { terrains: [1], contexts: {}, freq: { "1": [[1, 10], [2, 5], [3, 4]] } };
  const a = chooseChips(map(rows), defs, sheet), b = chooseChips(map(rows), defs, sheet);
  assert.deepEqual(a, b);
  const seen = new Set(a.flat());
  assert.ok(seen.has(1) && seen.has(2));
  assert.ok(!seen.has(3)); // 4 < 10 / 2
});
