import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runConversation, ollamaChat, type ChatFn } from "./bridge.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fea-bridge-"));
  for (const sub of ["data", "maps", "encounters"]) {
    await cp(join(REPO, sub), join(dir, sub), { recursive: true });
  }
  return dir;
}

test("the loop runs a requested tool call then finishes on a plain reply", async () => {
  const dir = await tempProject();
  try {
    let turn = 0;
    const chat: ChatFn = async (messages) => {
      turn++;
      if (turn === 1) {
        return { role: "assistant", content: "", tool_calls: [
          { function: { name: "set_unit", arguments: { id: "eirika-t", fields: { spd: 19 } } } },
        ] };
      }
      const toolMsg = messages.find((m) => m.role === "tool");
      assert.ok(toolMsg, "tool result should have been appended");
      return { role: "assistant", content: "Done: Eirika speed is now 19." };
    };
    const reply = await runConversation(chat, dir, "make Eirika faster");
    assert.match(reply, /19/);
    const units = JSON.parse(await readFile(join(dir, "data/units.json"), "utf8"));
    assert.equal(units["eirika-t"].spd, 19);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a tool error is fed back to the model rather than thrown", async () => {
  const dir = await tempProject();
  try {
    let turn = 0;
    let sawError = false;
    const chat: ChatFn = async (messages) => {
      turn++;
      if (turn === 1) {
        return { role: "assistant", content: "", tool_calls: [
          { function: { name: "set_unit", arguments: { id: "eirika-t", fields: { spd: "fast" } } } },
        ] };
      }
      const toolMsg = messages.find((m) => m.role === "tool");
      if (toolMsg && /error/i.test(String(toolMsg.content))) sawError = true;
      return { role: "assistant", content: "I could not do that." };
    };
    await runConversation(chat, dir, "break it");
    assert.ok(sawError, "the tool error should be returned to the model");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ollamaChat reports a clear error when the host is unreachable", async () => {
  const prev = process.env.FEA_OLLAMA_HOST;
  process.env.FEA_OLLAMA_HOST = "http://127.0.0.1:1"; // nothing listens here
  try {
    await assert.rejects(() => ollamaChat([{ role: "user", content: "hi" }], []), /Cannot reach Ollama/);
  } finally {
    if (prev === undefined) delete process.env.FEA_OLLAMA_HOST;
    else process.env.FEA_OLLAMA_HOST = prev;
  }
});
