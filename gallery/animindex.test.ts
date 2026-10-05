import { test } from "node:test";
import assert from "node:assert/strict";
import { animIndex } from "./animindex.ts";

// Build a tiny fake ROM. GBA ROM is mapped at 0x08000000, so a class pointer
// 0x08000010 lives at file offset 0x10. Each class points at a list of 4-byte
// entries [mode, flag, animIdLo, animIdHi]; a flag byte other than 1 ends the list.
function fakeRom(): Uint8Array {
  const rom = new Uint8Array(0x40);
  // A list at offset 0x10: two entries (modes 0 and 9) then a terminator.
  rom.set([0, 1, 58, 0], 0x10); // mode 0, anim id 58
  rom.set([9, 1, 59, 0], 0x14); // mode 9, anim id 59
  rom.set([0, 0, 0, 0], 0x18);  // terminator (flag 0)
  // A second list at offset 0x20: one entry.
  rom.set([1, 1, 17, 0], 0x20); // mode 1, anim id 17
  rom.set([0, 0, 0, 0], 0x24);  // terminator
  return rom;
}

test("animIndex maps each animation id to its class, parsing the mode list", () => {
  const classes = [
    { id: 7, name: "Paladin\u001f", BattleAnimePointer: "0x08000010" },
    { id: 17, name: "Myrmidon", BattleAnimePointer: "0x08000020" },
  ];
  const map = animIndex(fakeRom(), classes);
  assert.deepEqual(map[58], { cls: "Paladin", modes: [0] });
  assert.deepEqual(map[59], { cls: "Paladin", modes: [9] });
  assert.deepEqual(map[17], { cls: "Myrmidon", modes: [1] });
});

test("animIndex skips classes with a null or out-of-range pointer", () => {
  const classes = [
    { id: 1, name: "Dummy", BattleAnimePointer: "0x00000000" },
    { id: 2, name: "Bad", BattleAnimePointer: "0x09999999" },
    { id: 3, name: "NoField" },
  ];
  const map = animIndex(fakeRom(), classes);
  assert.deepEqual(map, {});
});

test("animIndex stops a runaway list rather than reading forever", () => {
  // A list with no terminator in range: every byte is flag 1. The guard caps it.
  const rom = new Uint8Array(0x40).fill(1);
  const classes = [{ id: 1, name: "X", BattleAnimePointer: "0x08000000" }];
  const map = animIndex(rom, classes);
  // Capped at 16 entries, so at most 16 ids recorded, no throw.
  assert.ok(Object.keys(map).length <= 16);
});
