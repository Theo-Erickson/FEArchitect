import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFields } from "./cli.ts";

test("parseFields coerces numbers and keeps strings", () => {
  assert.deepEqual(parseFields(["str=12", "spd=16", "name=Eirika"]), { str: 12, spd: 16, name: "Eirika" });
});

test("parseFields handles negative numbers and leaves non-numbers as strings", () => {
  assert.deepEqual(parseFields(["def=-2", "class=cavalier"]), { def: -2, class: "cavalier" });
});

test("parseFields ignores tokens without an equals sign", () => {
  assert.deepEqual(parseFields(["str=1", "garbage"]), { str: 1 });
});
