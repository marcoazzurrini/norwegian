// Whether a sentence can be used with what has been taught.
// The app asks this of a learner's memory; the build asks it of the course order, to choose examples.
import type { Sentence, Token } from "./schema";

/** Anything that can say whether an item has been taught: the memory itself, or a set of ids. */
export type Known = Pick<ReadonlySet<string>, "has">;

/** A name, or a word inside a phrase that has been taught as a whole. */
export const chunkCovered = (t: Token, known: Known): boolean =>
  t.free === true || (t.c !== undefined && known.has(t.c));

const tokenReady = (t: Token, known: Known): boolean => {
  if (chunkCovered(t, known)) {
    return true;
  }

  const patterns = t.p ?? [];
  const patternsKnown = patterns.every((p) => known.has(p));

  if (t.w !== undefined) {
    return known.has(t.w) && patternsKnown;
  }

  return patterns.length > 0 && patternsKnown;
};

/** A sentence is usable once every word in it has been taught. */
export const sentenceReady = (s: Sentence, known: Known): boolean => {
  if (!s.tokens.every((t) => tokenReady(t, known))) {
    return false;
  }

  return (
    s.tokens.every((t) => chunkCovered(t, known)) ||
    s.patterns.every((p) => known.has(p))
  );
};
