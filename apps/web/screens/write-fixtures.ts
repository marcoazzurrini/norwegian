// Writes the learner data that the end-to-end tests start from (e2e/data/seeds.json).
// The tests cannot build it themselves: their runner cannot load the engine. Run this again
// when the curriculum or the scheduler changes what a seeded learner looks like:
//   bun screens/write-fixtures.ts
import path from "node:path";

import { seedFor } from "./seed";

const seeds = {
  beforeThe: seedFor("beforeThe"),
  empty: seedFor("empty"),
  progress: seedFor("progress"),
};

const file = path.join(import.meta.dirname, "..", "e2e", "data", "seeds.json");

await Bun.write(file, `${JSON.stringify(seeds, null, 2)}\n`);

console.log(`Wrote ${file}`);
