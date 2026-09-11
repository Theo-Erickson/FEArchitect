import { test } from "node:test";
import assert from "node:assert/strict";
import { pathOffsetAt } from "./anim.ts";
import type { TileVec } from "./types.ts";

const PATH: TileVec[] = [{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }];
const FROM = { x: 1, y: 3 };
const TILE = 10;
const STEP = 120;

test("negative elapsed clamps to the start, never reads a bad index", () => {
  // requestAnimationFrame can hand back a timestamp earlier than the captured
  // start, making elapsed negative. This must not throw or return NaN.
  const o = pathOffsetAt(PATH, FROM, -50, STEP, TILE);
  assert.deepEqual(o, { x: 0, y: 0, done: false });
});

test("zero elapsed sits at the start tile", () => {
  assert.deepEqual(pathOffsetAt(PATH, FROM, 0, STEP, TILE), { x: 0, y: 0, done: false });
});

test("mid-first-segment interpolates", () => {
  // halfway through the first 120ms step, between (1,3) and (2,3)
  const o = pathOffsetAt(PATH, FROM, 60, STEP, TILE);
  assert.equal(o.x, 5); // half a tile (10) to the right
  assert.equal(o.y, 0);
  assert.equal(o.done, false);
});

test("overshooting the path lands on the last tile and reports done", () => {
  const o = pathOffsetAt(PATH, FROM, 99999, STEP, TILE);
  assert.deepEqual(o, { x: 20, y: 0, done: true }); // two tiles right of start
});

test("a degenerate single-tile path is immediately done", () => {
  const o = pathOffsetAt([{ x: 4, y: 4 }], { x: 4, y: 4 }, 0, STEP, TILE);
  assert.equal(o.done, true);
});
