// How an item is named and shown, wherever a task or a list mentions it.
import type { Course, Item } from "@norsk/course";

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
    .map(({ form, label }) => `"${label}" ${form}`)
    .join(", ");

  const facts = [...article, ...(forms === "" ? [] : [forms])];

  return facts.length === 0 ? name : `${name}: ${facts.join("; ")}`;
};

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
