import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSkills, passiveStatMods, hasEffect } from "./skills.ts";
import type { Skill } from "../types.ts";

const DEFS: Record<string, Skill> = {
  str_plus_2: { name: "Strength +2", kind: "statMod", mods: { str: 2 } },
  luna: { name: "Luna", kind: "combat", trigger: "sklRate", effect: "ignoreDef" },
};

test("resolveSkills merges unit and class skill ids into defs, ignoring unknowns", () => {
  const got = resolveSkills(["str_plus_2", "nope"], ["luna"], DEFS);
  assert.deepEqual(got.map((s) => s.name), ["Strength +2", "Luna"]);
});

test("passiveStatMods sums statMod skills", () => {
  assert.deepEqual(passiveStatMods([DEFS.str_plus_2, DEFS.luna]), { str: 2 });
});

test("hasEffect finds a combat effect", () => {
  assert.equal(hasEffect([DEFS.luna], "ignoreDef"), true);
  assert.equal(hasEffect([DEFS.luna], "lifesteal"), false);
});
