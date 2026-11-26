// The words around a card: what is asked for, the hint after a miss, and the line under the answer.
import type { CourseMeta, Item } from "@norsk/course";
import type { CardHint } from "@norsk/engine";

/** The articles of a course as they are named in a sentence: "en, ei or et". */
const articlesOf = ({ articles }: CourseMeta): string =>
  new Intl.ListFormat("en", { type: "disjunction" })
    .format(articles)
    // Three words read better without the comma before "or", as the app has always written them.
    .replace(", or ", " or ");

/** What the learner is asked to type, in words. */
export const cueKind = (one: Item, meta: CourseMeta): string => {
  if (one.kind === "chunk") {
    return "Phrase";
  }

  if (one.article !== undefined) {
    return `Noun, with ${articlesOf(meta)}`;
  }

  return one.pos === "verb" ? "Verb" : "Word";
};

/** How an item starts: three letters of a phrase of several words, one letter of a single word. */
const startOf = (words: string): string =>
  words.slice(0, words.trim().includes(" ") ? 3 : 1);

/** A prompt that points at the problem without giving the answer. */
export const cardHint = (one: Item, hint: CardHint, meta: CourseMeta): string =>
  hint === "article"
    ? `The word is right. Is it an ${articlesOf(meta)} word?`
    : `It starts with “${startOf(one.text.replaceAll("_", "").trim())}…”.`;

/** The same prompt while a new item is being learned, where the learner tries again at once. */
export const introHint = (
  one: Item,
  help: "article" | "start",
  meta: CourseMeta
): string =>
  help === "article"
    ? `Is it an ${articlesOf(meta)} word?`
    : `It starts with “${startOf(one.text)}…”. Try again.`;

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
  if (one.pluralOnly === true) {
    return "always plural";
  }

  if (one.article !== undefined) {
    return `${one.article} word`;
  }

  const present = one.forms?.find((row) => row.label === "now")?.form;

  if (one.pos === "verb" && present !== undefined && present !== one.text) {
    return `now: ${present}`;
  }

  return one.kind === "chunk" ? "phrase" : null;
};
