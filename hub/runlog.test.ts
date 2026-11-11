import { test } from "node:test";
import assert from "node:assert/strict";
import { RunLog } from "./runlog.ts";

test("joins partial chunks into whole lines per stream", () => {
  const log = new RunLog();
  assert.deepEqual(log.push("out", "hel"), []);
  assert.deepEqual(log.push("err", "oops\n"), [{ stream: "err", text: "oops" }]);
  assert.deepEqual(log.push("out", "lo\r\nworld\n"), [
    { stream: "out", text: "hello" },
    { stream: "out", text: "world" },
  ]);
});

test("strips ANSI codes and keeps only the last carriage-return segment", () => {
  const log = new RunLog();
  assert.deepEqual(log.push("out", "\x1b[32mok\x1b[0m\n10%\r50%\r100%\n").map((l) => l.text), ["ok", "100%"]);
});

test("flush emits unterminated output; sys adds a marker line", () => {
  const log = new RunLog();
  log.push("out", "tail");
  assert.deepEqual(log.flush(), [{ stream: "out", text: "tail" }]);
  assert.deepEqual(log.flush(), []);
  log.sys("exited 0");
  assert.equal(log.lines.at(-1)?.stream, "sys");
});

test("history is capped to the newest lines", () => {
  const log = new RunLog(3);
  log.push("out", "a\nb\nc\nd\ne\n");
  assert.deepEqual(log.lines.map((l) => l.text), ["c", "d", "e"]);
});
