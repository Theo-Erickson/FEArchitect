import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_LABELS, sectionLabel, idTag, weaponRankLabel, cellTitle } from "./format.ts";

test("SECTION_LABELS has 12 entries", () => {
  assert.equal(SECTION_LABELS.length, 12);
});

test("sectionLabel returns the label, or a fallback for out-of-range", () => {
  assert.equal(sectionLabel(0), "Melee attack");
  assert.equal(sectionLabel(6), "Dodge (armed)");
  assert.equal(sectionLabel(99), "Section 99");
});

test("idTag formats the id in brackets", () => {
  assert.equal(idTag(7), "[7]");
  assert.equal(idTag(0), "[0]");
});

test("weaponRankLabel maps the stored number to a rank letter", () => {
  assert.equal(weaponRankLabel(0), "-");
  assert.equal(weaponRankLabel(1), "E");
  assert.equal(weaponRankLabel(31), "D");
  assert.equal(weaponRankLabel(71), "C");
  assert.equal(weaponRankLabel(121), "B");
  assert.equal(weaponRankLabel(181), "A");
  assert.equal(weaponRankLabel(251), "S");
  assert.equal(weaponRankLabel(45), "D"); // between thresholds floors down
});

test("cellTitle labels a plain column as 'Name: value'", () => {
  assert.equal(cellTitle("BaseSpd", 7), "BaseSpd: 7");
});

test("cellTitle decodes a rank column with the letter in parentheses", () => {
  assert.equal(cellTitle("SwordRank", 31), "SwordRank: 31 (D)");
  assert.equal(cellTitle("WeaponRank", 1), "WeaponRank: 1 (E)");
  assert.equal(cellTitle("AxeRank", 0), "AxeRank: 0 (-)");
});
