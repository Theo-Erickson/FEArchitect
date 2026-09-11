import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

test("every tool has a name, description, object params, and a handler", () => {
  for (const t of TOOLSPECS) {
    assert.equal(typeof t.name, "string");
    assert.ok(t.description.length > 0, `${t.name} needs a description`);
    assert.equal(t.params.type, "object");
    assert.equal(typeof t.handler, "function");
  }
});

test("the expected tools are present", () => {
  const names = TOOLSPECS.map((t) => t.name).sort();
  assert.deepEqual(names, [
    "get", "list", "preview_encounter", "set_encounter", "set_unit", "set_weapon", "simulate_skirmish",
  ]);
});

test("toolByName finds a tool and returns undefined for a miss", () => {
  assert.equal(toolByName("list")!.name, "list");
  assert.equal(toolByName("nope"), undefined);
});
