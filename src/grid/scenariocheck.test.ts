import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScenario, errorsOf } from "./scenariocheck.ts";
import { tiny } from "./testkit.ts";

const hero = (at: number[], extra: any = {}) => ({ unit: "hero", weapon: "iron-sword", side: "player", at, ...extra });
const grunt = (at: number[], extra: any = {}) => ({ unit: "grunt", weapon: "iron-lance", side: "enemy", at, ...extra });

test("a clean scenario has no problems", () => {
  assert.deepEqual(checkScenario(tiny([hero([0, 0]), grunt([1, 1])])), []);
});

test("off the map is an error", () => {
  const p = checkScenario(tiny([hero([4, 0]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", unitId: "hero", message: "hero at [4,0] is off the 4x2 map" }]);
});

test("an impassable tile for the unit's movement type is an error", () => {
  const p = checkScenario(tiny([hero([3, 0]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", unitId: "hero", message: "hero at [3,0] is on Wall, impassable for foot units" }]);
});

test("two units on one tile is an error naming both", () => {
  const p = checkScenario(tiny([hero([1, 1]), grunt([1, 1])]));
  assert.deepEqual(p, [{ level: "error", message: "2 units on [1,1]: hero, grunt" }]);
});

test("duplicate placement ids are an error", () => {
  const p = checkScenario(tiny([hero([0, 0]), grunt([1, 1], { id: "hero" })]));
  assert.deepEqual(errorsOf(p).map((x) => x.message), ["2 placements share the id hero"]);
});

test("a side with no units is an error", () => {
  const p = checkScenario(tiny([hero([0, 0])]));
  assert.deepEqual(p, [{ level: "error", message: "the enemy side has no units" }]);
});

test("a weapon outside the class's weapon ranks is a warning, not an error", () => {
  const p = checkScenario(tiny([hero([0, 0]), grunt([1, 1], { weapon: "iron-sword" })]));
  assert.deepEqual(p, [{
    level: "warning", unitId: "grunt",
    message: "grunt's Iron Sword (sword) is not in Knight's weapon ranks (lance)",
  }]);
  assert.deepEqual(errorsOf(p), []);
});
