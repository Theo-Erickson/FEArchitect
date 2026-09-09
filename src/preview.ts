// Headless entry point. Loads an encounter, runs the math, prints the result.
// Usage is handled by Preview.cmd, which passes the encounter path.

import { loadBundle } from "./datagen.ts";
import { buildPreview } from "./combatpreview.ts";
import { formatPreview } from "./format.ts";

const encounterArg = process.argv[2] ?? "encounters/duel-01.json";
const seedArg = Number(process.argv[3] ?? 42);
const runsArg = Number(process.argv[4] ?? 1000);

const bundle = await loadBundle(encounterArg);
const result = buildPreview(bundle, { seed: seedArg, runs: runsArg });
console.log(formatPreview(bundle, result));
