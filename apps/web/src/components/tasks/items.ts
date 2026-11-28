// How an item is named and shown, wherever a task or a list mentions it.
import type { Course, Item } from "@norsk/course";
import type { Difference } from "@norsk/engine";

/** The gap in a phrase such as "jeg heter ___", with the spaces around it. */
const GAP = /\s*___\s*/gu;

/** Short description of what a pattern or word is, for hints and lists. */
export const nameOf = (one: Item): string =>
  one.kind === "pattern"
    ? (one.title ?? one.text)
    : `${one.text.replaceAll(GAP, " … ").trim()} (${one.gloss})`;

export const itemName = (course: Course, id: string): string =>
  nameOf(course.item(id));

/**
 * What the course teaches about an item, in one line: its name, then the rule of a pattern, or
 * the article and the forms of a word. It is written for the language model that explains a
 * mistake, so that the model reads the grammar here and does not make it up.
 */
export const itemFacts = (course: Course, id: string): string => {
  const one = course.item(id);
  const name = nameOf(one);

  if (one.kind === "pattern") {
    return [`${name}:`, ...(one.rule ?? [])].join(" ");
  }

  const article = one.article === undefined ? [] : [`${one.article} word`];

  // A word that never changes has an empty list of forms.
  const forms = (one.forms ?? [])
    .map(({ form, label }) => `"${label}" form “${form}”`)
    .join(", ");

  const facts = [...article, ...(forms === "" ? [] : [forms])];

  return facts.length === 0 ? name : `${name}: ${facts.join("; ")}`;
};

const quoted = (words: string[]): string =>
  words.map((word) => `“${word}”`).join(" ");

/** What a wrong word is, when it is the expected word in another form: the names the course gives that form. */
const formNames = (course: Course, id: string, typed: string[]): string => {
  const { forms, text } = course.item(id);

  const names = (forms ?? [])
    .filter(({ form }) => typed.includes(form.toLowerCase()))
    .map(({ label }) => `"${label}"`);

  if (names.length > 0) {
    return `, its ${names.join(" or ")} form`;
  }

  // A word such as "vår" has no table of forms, so its form has no name.
  return typed.includes(text.toLowerCase())
    ? ""
    : ", a form that this word does not have";
};

/**
 * One place where an answer differs from the expected sentence, in one line. Like `itemFacts`, it
 * is written for the language model: the app has found the difference, and the model is told what
 * kind it is, so that it does not guess.
 */
export const differenceFacts = (
  course: Course,
  { expected, sameWord, typed }: Difference
): string => {
  if (expected === null) {
    return `${quoted(typed)} is a word too many.`;
  }

  if (typed.length === 0) {
    return `“${expected}” is missing.`;
  }

  const kind =
    sameWord === null
      ? "not a form of the expected word, so a misspelling or a different word"
      : `the right word in the wrong form${formNames(course, sameWord, typed)}`;

  return `Expected “${expected}”, typed ${quoted(typed)}: ${kind}.`;
};

/** The line that stands for the differences when all the words are right and only their order is wrong. */
export const ORDER_ONLY = "All the words are right. Only their order is wrong.";

/** True if the item is shown with an article in front, such as "et hus". */
export const hasArticle = (one: Item): boolean =>
  one.pos === "noun" && one.display.includes(" ");

/** The sound of a word as shown to the learner: without the stress mark. */
export const soundOf = (ipa: string): string => ipa.replaceAll("ˈ", "");

/** A copy of the list in a random order. `random` returns a number from 0 up to, but not including, 1. */
export const shuffled = <Value>(
  list: readonly Value[],
  random: () => number
): Value[] => {
  const out = [...list];

  // Fisher-Yates, from the end: each place gets one of the values not yet placed.
  for (let at = out.length - 1; at > 0; at -= 1) {
    const from = Math.floor(random() * (at + 1));
    const picked = out[from];
    const last = out[at];

    if (picked !== undefined && last !== undefined) {
      out[at] = picked;
      out[from] = last;
    }
  }

  return out;
};
