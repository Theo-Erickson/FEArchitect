import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSheet, DEFAULT_SHEET, type SheetInfo } from "./tilebackdrop.ts";

const info = (name: string): SheetInfo => ({ name, file: "x.png", data: "x.json", chapters: [1], terrains: [1] });

test("pickSheet prefers the wanted sheet, then the default, then the first", () => {
  const sheets = [info("Fort"), info(DEFAULT_SHEET), info("Plains")];
  assert.equal(pickSheet(sheets, "Plains")?.name, "Plains");
  assert.equal(pickSheet(sheets, "Nope")?.name, DEFAULT_SHEET);
  assert.equal(pickSheet(sheets)?.name, DEFAULT_SHEET);
  assert.equal(pickSheet([info("Fort"), info("Plains")])?.name, "Fort");
  assert.equal(pickSheet([]), null);
});
