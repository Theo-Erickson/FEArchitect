import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { GAMES, cliPath, romPath, gameDir, presentGames } from "./paths.ts";

const ROOT = "/project";

test("GAMES lists the three GBA titles", () => {
  assert.deepEqual([...GAMES], ["fe6", "fe7", "fe8"]);
});

test("romPath uses the expected filenames", () => {
  assert.equal(romPath(ROOT, "fe8").replace(/\\/g, "/"), "/project/base/FE8_Clean.gba");
  assert.equal(romPath(ROOT, "fe6").replace(/\\/g, "/"), "/project/base/FE6_clean.gba");
});

test("gameDir and cliPath resolve under the project", () => {
  assert.equal(gameDir(ROOT, "fe7").replace(/\\/g, "/"), "/project/assets/reference/fe7");
  assert.ok(cliPath(ROOT).replace(/\\/g, "/").endsWith("tools/febuilder-cli/FEBuilderGBA.CLI.exe"));
});

test("presentGames returns only games whose ROM exists", () => {
  const onlyFe8 = (p: string) => p.replace(/\\/g, "/") === "/project/base/FE8_Clean.gba";
  assert.deepEqual(presentGames(ROOT, onlyFe8), ["fe8"]);
  assert.deepEqual(presentGames(ROOT, () => true), ["fe6", "fe7", "fe8"]);
  assert.deepEqual(presentGames(ROOT, () => false), []);
});
