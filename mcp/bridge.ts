// Local bridge: let a local model (Ollama running Qwen) drive the FEArchitect
// tools in natural language. The chat function is injectable so the loop is
// testable without a live Ollama.
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { TOOLSPECS, toolByName } from "./toolspecs.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Read at call time so the env can be changed per run (and per test).
function model(): string { return process.env.FEA_OLLAMA_MODEL ?? "qwen2.5"; }
function host(): string { return process.env.FEA_OLLAMA_HOST ?? "http://localhost:11434"; }

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: any } }[];
}

// A chat turn: given the running transcript and the tool definitions, return the
// model's next message. The real one posts to Ollama; tests inject a fake.
export type ChatFn = (messages: ChatMessage[], tools: any[]) => Promise<ChatMessage>;

// Ollama tool format: { type: "function", function: { name, description, parameters } }.
function ollamaTools(): any[] {
  return TOOLSPECS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.params } }));
}

export const ollamaChat: ChatFn = async (messages, tools) => {
  const h = host(), m = model();
  let res: Response;
  try {
    res = await fetch(`${h}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: m, messages, tools, stream: false }),
    });
  } catch {
    throw new Error(`Cannot reach Ollama at ${h}. Is it running? Try: ollama serve`);
  }
  if (!res.ok) throw new Error(`Ollama returned ${res.status}. Is the model "${m}" pulled? Try: ollama pull ${m}`);
  const data = await res.json();
  return data.message as ChatMessage;
};

// Run one user request to completion: loop tool calls until the model replies
// with plain text, and return that text. Each tool runs against `root`.
export async function runConversation(chat: ChatFn, root: string, userText: string): Promise<string> {
  const tools = ollamaTools();
  const messages: ChatMessage[] = [
    { role: "system", content: "You edit a Fire Emblem sandbox by calling the provided tools. Prefer set_* to change data, preview_encounter and simulate_skirmish to evaluate. Report results plainly." },
    { role: "user", content: userText },
  ];
  for (let i = 0; i < 12; i++) {
    const msg = await chat(messages, tools);
    messages.push(msg);
    if (!msg.tool_calls || msg.tool_calls.length === 0) return msg.content ?? "";
    for (const call of msg.tool_calls) {
      const spec = toolByName(call.function.name);
      let content: string;
      try {
        if (!spec) throw new Error(`unknown tool: ${call.function.name}`);
        const args = typeof call.function.arguments === "string" ? JSON.parse(call.function.arguments) : call.function.arguments;
        content = JSON.stringify(await spec.handler(root, args));
      } catch (e) {
        content = `error: ${(e as Error).message}`;
      }
      messages.push({ role: "tool", content });
    }
  }
  return "Stopped after too many tool calls without a final answer.";
}

// Interactive entry point: read lines from the terminal and run each through the
// loop against the real Ollama. Only runs when executed directly.
async function main(): Promise<void> {
  console.log(`FEArchitect bridge. Model ${model()} at ${host()}. Type a request, or "exit".`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  for (;;) {
    const line = (await rl.question("> ")).trim();
    if (!line || line === "exit") break;
    try {
      console.log(await runConversation(ollamaChat, ROOT, line));
    } catch (e) {
      console.error((e as Error).message);
    }
  }
  rl.close();
}

if (process.argv[1]?.endsWith("bridge.ts")) main();
