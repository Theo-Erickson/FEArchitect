import { test } from "node:test";
import assert from "node:assert/strict";
import { toBrowserJs, safeConfigPath, staticAllowed } from "./server.ts";

test("toBrowserJs strips TypeScript type syntax", () => {
  const ts = `export const x: number = 1;\nexport function f(a: string): string { return a; }\n`;
  const js = toBrowserJs(ts);
  // strip mode blanks type annotations with whitespace to preserve source
  // positions, so the type identifiers themselves must be gone.
  assert.doesNotMatch(js, /\bnumber\b/);
  assert.doesNotMatch(js, /\bstring\b/);
  // The runtime code survives (collapse the blanked whitespace to compare).
  const collapsed = js.replace(/\s+/g, " ");
  assert.match(collapsed, /export const x = 1;/);
  assert.match(collapsed, /return a;/);
});

test("safeConfigPath accepts known config files", () => {
  assert.equal(safeConfigPath("data/units.json"), true);
  assert.equal(safeConfigPath("data/weapons.json"), true);
  assert.equal(safeConfigPath("encounters/duel-01.json"), true);
});

test("safeConfigPath rejects traversal and unknown paths", () => {
  assert.equal(safeConfigPath("../secret.txt"), false);
  assert.equal(safeConfigPath("data/../../etc/passwd"), false);
  assert.equal(safeConfigPath("src/server.ts"), false);
});

test("safeConfigPath rejects any path containing a traversal segment", () => {
  // Even though this normalizes onto an allowed file, a raw ".." is refused.
  assert.equal(safeConfigPath("encounters/../data/units.json"), false);
});

test("staticAllowed permits the known roots and rejects traversal", () => {
  assert.equal(staticAllowed("src/game/client.ts"), true);
  assert.equal(staticAllowed("data/terrain.json"), true);
  assert.equal(staticAllowed("maps/showcase-terrain.json"), true);
  assert.equal(staticAllowed("encounters/skirmish-01.json"), true);
  assert.equal(staticAllowed("../secret"), false);
  assert.equal(staticAllowed("etc/passwd"), false);
});

test("staticAllowed serves map-sprite sheets", () => {
  assert.equal(staticAllowed("assets/mapsprites/paladin.png"), true);
  assert.equal(staticAllowed("assets/mapsprites/../../package.json"), false);
});

test("staticAllowed serves the terrain tileset folder", () => {
  assert.equal(staticAllowed("assets/tilesets/fe8/index.json"), true);
  assert.equal(staticAllowed("assets/tilesets/fe8/plains.png"), true);
  assert.equal(staticAllowed("assets/tilesets/../../base/FE8_Clean.gba"), false);
  assert.equal(staticAllowed("assets/other/x.png"), false);
});
