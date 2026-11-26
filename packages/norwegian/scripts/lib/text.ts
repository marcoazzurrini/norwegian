// Small text helpers shared by the build scripts.

/** Whether a field is present and not empty. */
export const filled = (s: string | undefined): s is string =>
  s !== undefined && s !== "";

/** The fields of a line such as "hus | noun et | house". */
export const fields = (s: string) => s.split("|").map((x) => x.trim());

/** The entries of a list such as "a, b, c", without the empty ones. */
export const listOf = (s: string, separator: string) =>
  s
    .split(separator)
    .map((x) => x.trim())
    .filter((x) => x !== "");

/** Lower case, no punctuation, single spaces: how two texts are compared. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replaceAll(/[.,!?:;"«»()]/gu, "")
    .replaceAll(/\s+/gu, " ")
    .trim();

/** The words of a text, compared as `norm` compares them. */
export const wordsOf = (s: string) => listOf(norm(s), " ");

/** A text as part of an id: lower-case letters and digits, joined by hyphens. */
export const slug = (s: string) =>
  s
    .toLowerCase()
    .replaceAll(/[^a-zæøå0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
