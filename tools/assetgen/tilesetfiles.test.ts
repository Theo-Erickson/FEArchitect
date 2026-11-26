import { test } from "node:test";
import assert from "node:assert/strict";
import { sheetFileName, dataFileFor } from "./tilesetfiles.ts";

test("sheetFileName slugs FE 8 sheet entries", () => {
  assert.deepEqual(sheetFileName("FE 8/Castle Blue.png"), { name: "Castle Blue", file: "castle-blue.png" });
  assert.deepEqual(sheetFileName("FE 8/Overworld Regular.png"), { name: "Overworld Regular", file: "overworld-regular.png" });
  assert.deepEqual(sheetFileName("FE 8/PLAINS.PNG"), { name: "PLAINS", file: "plains.png" });
});

test("sheetFileName skips other folders, non-PNGs and unsafe names", () => {
  assert.equal(sheetFileName("FE 7/Fort.png"), null);
  assert.equal(sheetFileName("FE 8/Thumbs.db"), null);
  assert.equal(sheetFileName("FE-Mappy Converter/Game.exe"), null);
  assert.equal(sheetFileName("FE 8/sub/Fort.png"), null);
  assert.equal(sheetFileName("FE 8/..png"), null);
  assert.equal(sheetFileName("FE 8/!!!.png"), null);
  assert.equal(sheetFileName("FE 8\\Fort.png"), null);
  assert.equal(sheetFileName("FE 8/CON.png"), null); // Windows device name
  assert.equal(sheetFileName("FE 8/lpt1.png"), null);
});

test("dataFileFor swaps the extension", () => {
  assert.equal(dataFileFor("castle-blue.png"), "castle-blue.json");
});
