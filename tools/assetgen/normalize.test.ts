import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHex, normalizeRow, normalizeTable } from "./normalize.ts";

test("parseHex parses hex strings", () => {
  assert.equal(parseHex("0x46"), 70);
  assert.equal(parseHex("0x00"), 0);
});

test("normalizeRow splits Index into id and name and parses hex fields", () => {
  const row = normalizeRow({ Index: "0x00 Eirika", BaseLck: "0x05", BaseHP: "0x00" });
  assert.equal(row.id, 0);
  assert.equal(row.name, "Eirika");
  assert.equal(row.BaseLck, 5);
  assert.equal(row.BaseHP, 0);
});

test("normalizeRow keeps pointer fields as raw hex strings", () => {
  const row = normalizeRow({ Index: "0x02 Lord", BattleAnimePointer: "0x00abcdef", BaseMov: "0x05" });
  assert.equal(row.id, 2);
  assert.equal(row.name, "Lord");
  assert.equal(row.BattleAnimePointer, "0x00abcdef");
  assert.equal(row.BaseMov, 5);
});

test("normalizeRow handles an Index with no name and leaves non-hex strings", () => {
  const row = normalizeRow({ Index: "0x10", Note: "hello" });
  assert.equal(row.id, 16);
  assert.equal(row.name, "");
  assert.equal(row.Note, "hello");
});

test("normalizeTable maps rows and accepts object-or-array raw export", () => {
  assert.deepEqual(
    normalizeTable([{ Index: "0x01 Iron Sword", Might: "0x05" }]),
    [{ id: 1, name: "Iron Sword", Might: 5 }],
  );
  assert.equal(normalizeTable({ a: { Index: "0x01 X", Hit: "0x5A" } } as any)[0].Hit, 90);
});
