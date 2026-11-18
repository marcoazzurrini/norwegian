// The words around a card: what is asked for, the hint after a miss, and the line under the answer.
import type { Item } from "@norsk/content";
import type { CardHint } from "@norsk/engine";

/** What the learner is asked to type, in words. */
export const cueKind = (one: Item): string => {
  if (one.kind === "chunk") {
    return "Phrase";
  }

  if (one.pos === "noun" && one.gender !== undefined && one.gender !== "pl") {
    return "Noun, with en, ei or et";
  }

  return one.pos === "verb" ? "Verb" : "Word";
};

/** How an item starts: three letters of a phrase, one of a word. */
const startOf = (one: Item, words: string): string =>
  words.slice(0, one.kind === "chunk" ? 3 : 1);

/** A prompt that points at the problem without giving the answer. */
export const cardHint = (one: Item, hint: CardHint): string =>
  hint === "article"
    ? "The word is right. Is it an en, ei or et word?"
    : `It starts with “${startOf(one, one.text.replaceAll("_", "").trim())}…”.`;

/** The same prompt while a new item is being learned, where the learner tries again at once. */
export const introHint = (one: Item, help: "article" | "start"): string =>
  help === "article"
    ? "Is it an en, ei or et word?"
    : `It starts with “${startOf(one, one.text)}…”. Try again.`;

/** The line under the answer of a card. */
export const cardNote = (firstTry: boolean, correct: boolean): string => {
  if (firstTry) {
    return "Correct.";
  }

  return correct
    ? "Correct on the second try. It will come back soon."
    : "This is the answer. It will come back soon.";
};

/** One fact worth knowing about a new word, or null. */
export const wordFact = (one: Item): string | null => {
  if (one.gender === "pl") {
    return "always plural";
  }

  if (one.pos === "noun" && one.gender !== undefined) {
    return `${one.gender} word`;
  }

  const present = one.forms?.find((row) => row.label === "now")?.form;

  if (one.pos === "verb" && present !== undefined && present !== one.text) {
    return `now: ${present}`;
  }

  return one.kind === "chunk" ? "phrase" : null;
};
