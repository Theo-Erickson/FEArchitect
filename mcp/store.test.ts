import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readJson, readJsonOpt, writeJsonAtomic, loadClassesAll, resolveScenarioOnDisk, resolveMapOnDisk, readScenario,
} from "./store.ts";
import { ROOT, HAS_FE8, tempProject } from "./testproject.ts";

test("readJsonOpt returns the fallback only for a missing file", async () => {
  assert.deepEqual(await readJsonOpt(ROOT, "data/nope.json", { a: 1 }), { a: 1 });
  assert.equal((await readJsonOpt(ROOT, "data/units.json", {}))["eirika-t"].name, "Eirika");
});

test("writeJsonAtomic writes formatted JSON and leaves no temp file", async () => {
  const dir = await tempProject();
  try {
    await writeJsonAtomic(dir, "encounters/new.json", { id: "new" });
    assert.equal(await readFile(join(dir, "encounters/new.json"), "utf8"), '{\n  "id": "new"\n}\n');
    assert.ok(!(await readdir(join(dir, "encounters"))).some((f) => f.endsWith(".tmp")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadClassesAll layers custom classes over FE8 sim classes", async () => {
  const classes = await loadClassesAll(ROOT);
  assert.equal(classes.paladin.move, 8); // custom data/classes.json wins
  if (HAS_FE8) assert.ok(classes["great-lord"]);
});

test("resolveScenarioOnDisk resolves scenario-01 from the repo", async () => {
  const sc = await resolveScenarioOnDisk(ROOT, await readJson(ROOT, "encounters/scenario-01.json"));
  assert.equal(sc.units.length, 4);
  assert.equal(sc.map.id, "showcase-terrain");
});

test("resolveMapOnDisk resolves a custom map and reports a missing one by name", async () => {
  const { map } = await resolveMapOnDisk(ROOT, "showcase-terrain");
  assert.equal(map.width, 11);
  await assert.rejects(() => resolveMapOnDisk(ROOT, "no-such-map"), /unknown map: maps\/no-such-map\.json/);
});

test("resolveMapOnDisk reads an FE8 chapter grid", { skip: !HAS_FE8 }, async () => {
  const { map } = await resolveMapOnDisk(ROOT, "fe8-1");
  assert.equal(map.width, 15);
  assert.equal(map.height, 10);
});

test("readScenario rejects missing files and 1v1 encounters", async () => {
  assert.equal((await readScenario(ROOT, "scenario-01")).map, "showcase-terrain");
  await assert.rejects(() => readScenario(ROOT, "nope"), /scenario nope not found/);
  await assert.rejects(() => readScenario(ROOT, "duel-01"), /not a multi-unit scenario/);
});
