import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainSprite, unitSprite, TILE_COLORS, terrainLayer } from "./render.ts";

test("terrain sprites include the expected motif", () => {
  assert.match(terrainSprite("forest", 0, 0, 64, 1, 1), /polygon/);   // pine triangles
  assert.match(terrainSprite("water", 0, 0, 64, 1, 1), /path/);       // waves
  assert.match(terrainSprite("mountain", 0, 0, 64, 1, 1), /polygon/); // peaks
  const plains = terrainSprite("plains", 0, 0, 64, 1, 1);
  assert.ok(plains.includes("path") || plains.includes("stroke"));
});

test("terrain variation differs by tile coordinates", () => {
  const a = terrainSprite("forest", 0, 0, 64, 1, 1);
  const b = terrainSprite("forest", 0, 0, 64, 8, 2);
  assert.notEqual(a, b);
});

test("unit sprites distinguish movement types", () => {
  const foot = unitSprite("foot", 32, 32, 64, 24, "#2b6cff");
  const cav = unitSprite("cav", 32, 32, 64, 24, "#2b6cff");
  const fly = unitSprite("fly", 32, 32, 64, 30, "#e0453b");
  assert.match(cav, /ellipse/);   // horse body
  assert.match(fly, /ellipse/);   // hover shadow
  assert.notEqual(foot, cav);
  assert.notEqual(cav, fly);
  assert.match(fly, /30/);        // HP number rendered
});

test("TILE_COLORS covers the terrain palette", () => {
  for (const id of ["plains", "forest", "mountain", "water", "wall"]) {
    assert.ok(TILE_COLORS[id], `missing color for ${id}`);
  }
});

test("terrainLayer without a backdrop draws a coloured rect per tile", () => {
  const svg = terrainLayer([["plains", "water"]], 48, null);
  assert.equal((svg.match(/<rect /g) ?? []).length, 2);
  assert.match(svg, new RegExp(TILE_COLORS.water));
  assert.doesNotMatch(svg, /<image/);
});

test("terrainLayer with a backdrop draws the image once and placeholders only where uncovered", () => {
  const svg = terrainLayer([["plains", "water"]], 48, { href: "data:image/png;base64,AA", covered: [[true, false]] });
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.match(svg, /width="96" height="48"/);
  assert.match(svg, /image-rendering:pixelated/);
  assert.equal((svg.match(/<rect /g) ?? []).length, 1); // only the uncovered water tile
  assert.match(svg, new RegExp(`x="48" y="0" width="48" height="48" fill="${TILE_COLORS.water}"`));
});
