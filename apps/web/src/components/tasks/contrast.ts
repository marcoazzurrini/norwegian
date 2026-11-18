// Splits an example such as "en bil > bilen" and marks the part of the second form that is new.

export interface Contrast {
  /** The form before the change, or null for an example that shows one form only. */
  from: string | null;
  /** The part of the second form that was there before. */
  kept: string;
  /** The part of the second form that is new. Empty if nothing stands out. */
  added: string;
}

const PUNCTUATION = /[!?.]/gu;

const lastWord = (words: string): string => words.split(" ").at(-1) ?? "";

/** How many characters the two texts share from the start. */
const sharedStart = (a: string, b: string, at = 0): number =>
  at < a.length && at < b.length && a[at] === b[at]
    ? sharedStart(a, b, at + 1)
    : at;

/** The text that is spoken for an example: its second form if it has two. */
export const spokenForm = (example: string): string =>
  (example.split(">").at(-1) ?? "").trim();

export const contrast = (example: string): Contrast => {
  const [first = "", second = ""] = example
    .split(">")
    .map((part) => part.trim());

  if (second === "") {
    return { added: "", from: null, kept: first };
  }

  // An ending added to the last word: "en bil > bilen".
  const base = lastWord(first).replaceAll(PUNCTUATION, "");
  const target = lastWord(second);
  const lead = second.slice(0, second.length - target.length);

  if (target.startsWith(base) && target.length > base.length) {
    return { added: target.slice(base.length), from: first, kept: lead + base };
  }

  // Otherwise whatever follows the start that the two forms share: "jeg snakker > jeg snakket".
  const shared = sharedStart(first, second);

  return shared > 2 && shared < second.length
    ? {
        added: second.slice(shared),
        from: first,
        kept: second.slice(0, shared),
      }
    : { added: "", from: first, kept: second };
};
