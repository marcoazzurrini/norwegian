// The gender of a Spanish noun, as the unit files write it: the article the noun is learned with.
import * as v from "valibot";

/** "los" and "las" are for a noun that only has a plural, such as "las gafas". */
export const GenderSchema = v.picklist(["el", "la", "los", "las"]);

export type Gender = v.InferOutput<typeof GenderSchema>;

/** Whether the noun only has a plural. */
export const pluralOnly = (gender: Gender | undefined): boolean =>
  gender === "los" || gender === "las";
