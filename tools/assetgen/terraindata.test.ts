import { test } from "node:test";
import assert from "node:assert/strict";
import { extractTerrain, TERRAIN_COUNT } from "./terraindata.ts";

const OFF = (addr: number) => addr - 0x08000000;
const put = (rom: Uint8Array, addr: number, bytes: number[]) => rom.set(bytes, OFF(addr));

test("extractTerrain reads the FE8 terrain tables, 255 move cost becomes null", () => {
  const rom = new Uint8Array(0x900000); // covers the table offsets
  // ids 0..3: id 2 forest-like, id 3 impassable to foot/cav.
  put(rom, 0x0880b849, [9, 1, 2, 255]); // foot (CommonT1)
  put(rom, 0x0880bad3, [9, 1, 3, 255]); // cav (HorseT2)
  put(rom, 0x0880bb96, [9, 1, 1, 1]);   // fly
  put(rom, 0x0880c479, [0, 0, 20, 30]); // avoid ground
  put(rom, 0x0880c53c, [0, 0, 0, 0]);   // avoid fly
  put(rom, 0x0880c4ba, [0, 0, 1, 2]);   // def ground
  put(rom, 0x0880c57d, [0, 0, 0, 0]);   // def fly
  put(rom, 0x0880c4fb, [0, 0, 0, 0]);   // res ground
  put(rom, 0x0880c5be, [0, 0, 0, 0]);   // res fly
  put(rom, 0x0880c744, [0, 0, 0, 0]);   // heal
  put(rom, 0x0880c785, [0, 0, 0, 0]);   // heals status
  new DataView(rom.buffer).setUint16(OFF(0x0880d374) + 2 * 2, 0x1234, true); // name id for id 2

  const defs = extractTerrain(rom);
  assert.equal(defs.length, TERRAIN_COUNT);
  assert.deepEqual(defs[2], {
    id: 2, nameTextId: 0x1234,
    avoid: 20, def: 1, res: 0, flyAvoid: 0, flyDef: 0, flyRes: 0,
    heal: 0, healsStatus: false,
    moveCost: { foot: 2, cav: 3, fly: 1 },
  });
  assert.equal(defs[3].moveCost.foot, null); // 255 -> null
  assert.equal(defs[3].moveCost.fly, 1);
});
