import { test } from "node:test";
import assert from "node:assert/strict";
import { terrainGrid } from "./terraingrid.ts";

test("terrainGrid maps each cell's layout offset to a terrain id via the lookup", () => {
  // config: TSA region is 8192 bytes, then the terrain lookup (u8) starts at 8192.
  const config = new Uint8Array(9216);
  config[8192 + 0] = 12; // lookup index 0 -> terrain 12
  config[8192 + 5] = 16; // lookup index 5 -> terrain 16
  // layout offsets (already value>>3): offset 0 -> index 0>>2 = 0; offset 20 -> 20>>2 = 5.
  const layout = Uint16Array.from([0, 20]);
  const grid = terrainGrid(config, layout, 2, 1);
  assert.deepEqual(grid, [[12, 16]]);
});
