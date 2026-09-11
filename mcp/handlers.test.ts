import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  list, get, previewEncounter, simulateSkirmish, setUnit, setWeapon, setEncounter,
} from "./handlers.ts";

// The repo root is the parent of this file's directory (mcp/..).
const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// A throwaway copy of the project data so write tests never touch real files.
async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-mcp-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(ROOT, sub), join(dir, sub), { recursive: true });
  }
  return dir;
}

test("list returns ids for each kind", async () => {
  const units = await list(ROOT, "units");
  assert.ok(units.includes("eirika-t"));
  const encounters = await list(ROOT, "encounters");
  assert.ok(encounters.includes("skirmish-01"));
});

test("get returns a record", async () => {
  const u = await get(ROOT, "unit", "eirika-t");
  assert.equal(u.name, "Eirika");
});

test("previewEncounter returns deterministic and monteCarlo, stable by seed", async () => {
  const a = await previewEncounter(ROOT, "duel-01", 42, 300);
  const b = await previewEncounter(ROOT, "duel-01", 42, 300);
  assert.deepEqual(a, b);
  assert.ok("deterministic" in a && "monteCarlo" in a);
});

test("simulateSkirmish runs to a result, stable by seed", async () => {
  const a = await simulateSkirmish(ROOT, "skirmish-01", 5);
  const b = await simulateSkirmish(ROOT, "skirmish-01", 5);
  assert.deepEqual(a, b);
  assert.notEqual(a.status, "ongoing");
  assert.ok(Array.isArray(a.log));
});

test("setUnit writes a valid edit to the temp project", async () => {
  const dir = await tempProject();
  try {
    const res = await setUnit(dir, "eirika-t", { spd: 20 });
    assert.equal(res.spd, 20);
    const onDisk = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.equal(onDisk["eirika-t"].spd, 20);
    assert.equal(onDisk["eirika-t"].name, "Eirika"); // merge kept other fields
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setUnit rejects an invalid edit and leaves the file unchanged", async () => {
  const dir = await tempProject();
  try {
    const before = await readFile(join(dir, "data/units.json"), "utf8");
    await assert.rejects(() => setUnit(dir, "eirika-t", { spd: "fast" as any }), /numeric/i);
    const after = await readFile(join(dir, "data/units.json"), "utf8");
    assert.equal(before, after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setEncounter validates a skirmish by resolving it", async () => {
  const dir = await tempProject();
  try {
    await assert.rejects(
      () => setEncounter(dir, "bad", {
        id: "bad", map: "showcase-terrain",
        player: { unit: "nope", weapon: "iron-sword", at: [1, 3] },
        enemy: { unit: "wyvern-1", weapon: "iron-lance", at: [9, 3] },
      }),
      /unit/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("setWeapon writes a valid edit", async () => {
  const dir = await tempProject();
  try {
    const res = await setWeapon(dir, "iron-sword", { might: 6 });
    assert.equal(res.might, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
