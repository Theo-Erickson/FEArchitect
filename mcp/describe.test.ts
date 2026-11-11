import { test } from "node:test";
import assert from "node:assert/strict";
import { describeMap, describeScenario } from "./describe.ts";
import { tiny, TK_TERRAIN } from "../src/grid/testkit.ts";
import { checkScenario } from "../src/grid/scenariocheck.ts";

test("describeMap draws the grid with rulers and a legend ordered by frequency", () => {
  const sc = tiny([{ unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] }]);
  const d = describeMap(sc.map, TK_TERRAIN);
  assert.equal(d.width, 4);
  assert.equal(d.height, 2);
  assert.equal(d.text, [
    "map tiny: 4x2 (x right, y down)",
    "   0123",
    " 0 ..,:",
    " 1 ....",
    "",
    "legend (move cost foot/cav/fly, - = impassable):",
    ". Plains [plains] def 0 avoid 0 move 1/1/1",
    ", Forest [forest] def 1 avoid 20 move 2/3/1",
    ": Wall [wall] def 0 avoid 0 move -/-/-",
  ].join("\n"));
});

test("describeMap adds a tens ruler for maps wider than 10", () => {
  const map = { id: "wide", width: 12, height: 1, terrain: [Array(12).fill("plains")] };
  const lines = describeMap(map, TK_TERRAIN).text.split("\n");
  assert.equal(lines[1], "             11");
  assert.equal(lines[2], "   012345678901");
});

test("describeScenario overlays units and lists them with problems", () => {
  const sc = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "grunt", weapon: "iron-sword", side: "enemy", at: [1, 1] },
  ]);
  const d = describeScenario(sc, checkScenario(sc));
  const lines = d.text.split("\n");
  assert.equal(lines[0], "scenario t on tiny: 4x2 (x right, y down)");
  assert.equal(lines[2], " 0 A.,:");
  assert.equal(lines[3], " 1 .a..");
  assert.ok(lines.includes("A hero (player) Hero, Infantry L-, at [0,0], HP 20 Str 6 Mag 0 Skl 7 Spd 8 Lck 5 Def 4 Res 2 Con 7, Iron Sword, ai aggressive"));
  assert.ok(lines.includes("warning: grunt's Iron Sword (sword) is not in Knight's weapon ranks (lance)"));
  assert.deepEqual(d.units.map((u) => [u.mark, u.id, u.side]), [["A", "hero", "player"], ["a", "grunt", "enemy"]]);
  assert.equal(d.problems.length, 1);
});

test("describeScenario says problems: none when clean, and @ marks a shared tile", () => {
  const clean = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [0, 0] },
    { unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
  ]);
  assert.ok(describeScenario(clean, []).text.endsWith("problems: none"));
  const shared = tiny([
    { unit: "hero", weapon: "iron-sword", side: "player", at: [1, 1] },
    { unit: "grunt", weapon: "iron-lance", side: "enemy", at: [1, 1] },
  ]);
  assert.equal(describeScenario(shared, checkScenario(shared)).text.split("\n")[3], " 1 .@..");
});
