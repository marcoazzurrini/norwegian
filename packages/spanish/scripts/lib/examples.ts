import { sentenceReady } from "@norsk/course";
// Chooses, for each word and chunk, the sentence that first shows it in use: its example.
//
// The example is fixed here, and not picked while the app runs, so that the build can refuse a word
// that has none. It is chosen for a learner who takes the lessons in course order: it may use the item
// itself and everything taught before it, and nothing else.
import type { Item, Sentence } from "@norsk/course";

import type { Draft, Report } from "./draft";

/** Every sentence that uses an item as a word or inside a chunk, in the order written. */
const sentencesByItem = (sentences: Sentence[]): Map<string, Sentence[]> => {
  const found = new Map<string, Sentence[]>();

  for (const sentence of sentences) {
    const ids = new Set(sentence.tokens.flatMap((t) => [t.w, t.c]));

    for (const id of ids) {
      if (id !== undefined) {
        found.set(id, [...(found.get(id) ?? []), sentence]);
      }
    }
  }

  return found;
};

/**
 * Whether a sentence shows more of an item than the item itself.
 * A word must stand outside every set phrase, in a sentence of more than that word:
 * "Jeg heter Anna." is the phrase "jeg heter ___", and teaches nothing new about "hete".
 * A chunk must come with at least one word of its own sentence, which may be a name.
 */
const showsInUse = (item: Item, sentence: Sentence): boolean =>
  item.kind === "chunk"
    ? sentence.tokens.some((t) => t.c !== item.id)
    : sentence.tokens.length > 1 &&
      sentence.tokens.some((t) => t.w === item.id && t.c === undefined);

/**
 * Sets `exampleId` on every word and chunk that has a fitting sentence: the shortest one, and of
 * two equally short the one written first. A word without one is an error, unless its line says
 * "no-example". A chunk is a set phrase already, so it may go without.
 */
export const chooseExamples = (
  draft: Draft,
  sentences: Sentence[],
  report: Report
) => {
  const uses = sentencesByItem(sentences);
  const taught = new Set<string>();

  for (const lesson of draft.lessons) {
    for (const id of lesson.items) {
      taught.add(id);

      const info = draft.info.get(id);

      if (info === undefined || info.item.kind === "pattern") {
        continue;
      }

      const { item } = info;

      const [example] = (uses.get(id) ?? [])
        .filter((s) => showsInUse(item, s) && sentenceReady(s, taught))
        .toSorted((a, b) => a.tokens.length - b.tokens.length);

      if (example !== undefined) {
        item.exampleId = example.id;
      }

      if (item.kind !== "word") {
        continue;
      }

      const where = `lesson "${lesson.title}", ${item.id}`;

      if (example === undefined && !info.noExample) {
        report.errors.push(
          `${where}: no example sentence. Write a sentence that uses "${item.text}" outside a set phrase, with words taught before it, or mark the word "no-example"`
        );
      }

      if (example !== undefined && info.noExample) {
        report.warnings.push(
          `${where}: is marked "no-example" but has the example "${example.target}"`
        );
      }
    }
  }
};
