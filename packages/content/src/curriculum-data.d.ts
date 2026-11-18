// The type of the built curriculum, stated once instead of worked out from the JSON.
//
// Importing curriculum.json directly makes TypeScript work out a literal type for 400 KB of data,
// which is slow and does not match the Curriculum type without a type assertion.
// So index.ts imports curriculum-data.js, and TypeScript reads this file for its type.
// The type is true because scripts/build-content.ts checks the curriculum against the schema before writing it.
import type { Curriculum } from "./schema";

declare const curriculum: Curriculum;

export default curriculum;
