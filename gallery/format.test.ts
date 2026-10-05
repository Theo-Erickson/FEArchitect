import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_LABELS, sectionLabel, idTag } from "./format.ts";

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
