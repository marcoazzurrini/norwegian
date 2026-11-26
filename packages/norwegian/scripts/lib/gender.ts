// The gender of a Norwegian noun, as the unit files write it.
import * as v from "valibot";

/** The article a noun takes. "pl" is a noun that only has a plural, such as "penger". */
export const GenderSchema = v.picklist(["en", "ei", "et", "pl"]);

export type Gender = v.InferOutput<typeof GenderSchema>;
