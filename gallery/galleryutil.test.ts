import { test } from "node:test";
import assert from "node:assert/strict";
import { staticAllowed, animCacheRel, animArgs, validAnimRequest } from "./galleryutil.ts";

test("staticAllowed permits gallery and reference, rejects traversal", () => {
  assert.equal(staticAllowed("gallery/index.html"), true);
  assert.equal(staticAllowed("assets/reference/fe8/units.json"), true);
  assert.equal(staticAllowed("assets/reference/fe8/portraits/portrait_002.png"), true);
  assert.equal(staticAllowed("../secret"), false);
  assert.equal(staticAllowed("src/combat.ts"), false);
});

test("animCacheRel is stable and game/id/section scoped", () => {
  assert.equal(animCacheRel("fe8", 12, 0), "assets/reference/fe8/anims/12_0.gif");
  assert.equal(animCacheRel("fe7", 3, 2), "assets/reference/fe7/anims/3_2.gif");
});

test("animArgs builds the CLI argument list", () => {
  assert.deepEqual(
    animArgs("/base/FE8.gba", 5, 1, "/out/5_1.gif"),
    ["--rom=/base/FE8.gba", "--export-battle-anime", "--animation-id=5", "--gif", "--section=1", "--out=/out/5_1.gif"],
  );
});

test("validAnimRequest checks game, id, section ranges", () => {
  assert.equal(validAnimRequest("fe8", 0, 0), true);
  assert.equal(validAnimRequest("fe8", 400, 11), true);
  assert.equal(validAnimRequest("xx", 1, 0), false);
  assert.equal(validAnimRequest("fe8", -1, 0), false);
  assert.equal(validAnimRequest("fe8", 1, 12), false);
  assert.equal(validAnimRequest("fe8", 1.5, 0), false);
});
