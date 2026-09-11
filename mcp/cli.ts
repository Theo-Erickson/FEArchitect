// Deterministic command-line frontend over the handlers. No LLM. Run as:
//   node mcp/cli.ts <command> ...args
// Commands: list, get, preview, simulate, set-unit, set-weapon, set-encounter.
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as h from "./handlers.ts";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

// Turn key=value tokens into an object, coercing integer-looking values.
export function parseFields(tokens: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const tok of tokens) {
    const eq = tok.indexOf("=");
    if (eq < 0) continue;
    const key = tok.slice(0, eq);
    const raw = tok.slice(eq + 1);
    out[key] = /^-?\d+$/.test(raw) ? Number(raw) : raw;
  }
  return out;
}

// Read an optional --flag value out of an argv list.
function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  let result: unknown;
  switch (cmd) {
    case "list":
      result = await h.list(ROOT, rest[0]); break;
    case "get":
      result = await h.get(ROOT, rest[0], rest[1]); break;
    case "preview": {
      const seed = flag(rest, "seed"); const runs = flag(rest, "runs");
      result = await h.previewEncounter(ROOT, rest[0], seed ? Number(seed) : undefined, runs ? Number(runs) : undefined);
      break;
    }
    case "simulate": {
      const seed = flag(rest, "seed");
      result = await h.simulateSkirmish(ROOT, rest[0], seed ? Number(seed) : undefined);
      break;
    }
    case "set-unit":
      result = await h.setUnit(ROOT, rest[0], parseFields(rest.slice(1))); break;
    case "set-weapon":
      result = await h.setWeapon(ROOT, rest[0], parseFields(rest.slice(1))); break;
    case "set-encounter": {
      const file = flag(rest, "file");
      if (!file) throw new Error("set-encounter needs --file <path-to-json>");
      const spec = JSON.parse(await readFile(file, "utf8"));
      result = await h.setEncounter(ROOT, rest[0], spec);
      break;
    }
    default:
      console.log("commands: list <kind> | get <kind> <id> | preview <id> [--seed N] [--runs N] | simulate <id> [--seed N] | set-unit <id> k=v... | set-weapon <id> k=v... | set-encounter <id> --file f.json");
      process.exit(cmd ? 1 : 0);
      return;
  }
  console.log(JSON.stringify(result, null, 2));
}

// Only run when invoked directly, not when imported by tests (importing must not
// trigger main(), which reads argv and may process.exit).
if (process.argv[1]?.endsWith("cli.ts")) {
  main().catch((e) => { console.error("error:", (e as Error).message); process.exit(1); });
}
