import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRng, roll2RN } from "./rng.ts";

test("same seed yields the same sequence", () => {
  const a = makeRng(123);
  const b = makeRng(123);
  const seqA = [a.next100(), a.next100(), a.next100(), a.next100()];
  const seqB = [b.next100(), b.next100(), b.next100(), b.next100()];
  assert.deepEqual(seqA, seqB);
});

test("different seeds diverge", () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notDeepEqual(
    [a.next100(), a.next100(), a.next100()],
    [b.next100(), b.next100(), b.next100()],
  );
});

test("next100 stays in 0..99", () => {
  const r = makeRng(999);
  for (let i = 0; i < 5000; i++) {
    const v = r.next100();
    assert.ok(v >= 0 && v <= 99, `value out of range: ${v}`);
  }
});

test("roll2RN with 0 never hits and 100 always hits", () => {
  const r = makeRng(7);
  for (let i = 0; i < 200; i++) {
    assert.equal(roll2RN(0, r), false);
    assert.equal(roll2RN(100, r), true);
  }
});
