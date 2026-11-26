// Works out which lessons each lesson needs: from what the author wrote, from the patterns it teaches,
// and from the words its examples use.
import type { Item, Lesson } from "@norsk/course";

import { analyse } from "./analyse";
import type { Draft, Report } from "./draft";
import { lessonOfItem } from "./vocabulary";
import type { Vocabulary } from "./vocabulary";

/** Lessons named in the "needs:" of a lesson heading, by pattern id or by lesson title. */
const writtenNeeds = (
  draft: Draft,
  report: Report,
  lesson: Lesson,
  written: string[]
): number[] => {
  const needs: number[] = [];

  for (const name of written) {
    const byPattern = draft.info.get(`p:${name}`)?.item.lesson;

    const byTitle = draft.lessons.find(
      (l) => l.title.toLowerCase() === name.toLowerCase()
    )?.index;

    const hit = byPattern ?? byTitle;

    if (hit === undefined) {
      report.errors.push(`lesson "${lesson.title}": unknown need "${name}"`);
    } else {
      needs.push(hit);
    }
  }

  return needs;
};

/** Other lessons that teach the patterns this pattern builds on. */
const patternNeeds = (
  draft: Draft,
  report: Report,
  lesson: Lesson,
  pattern: Item
): number[] => {
  const needs: number[] = [];

  for (const need of pattern.needs ?? []) {
    const taughtIn = draft.info.get(need)?.item.lesson;

    if (taughtIn === undefined) {
      report.errors.push(`pattern ${pattern.id}: unknown need ${need}`);
    } else if (taughtIn !== lesson.index) {
      needs.push(taughtIn);
    }
  }

  return needs;
};

/**
 * Earlier lessons that teach the words in a pattern's examples and quiz prompts.
 * A pattern's examples may only use words that are already taught.
 */
const exampleNeeds = (
  vocabulary: Vocabulary,
  report: Report,
  lesson: Lesson,
  pattern: Item
): number[] => {
  const needs: number[] = [];

  const examples = [
    ...(pattern.examples ?? []).map((e) => e.target),
    ...(pattern.quiz ?? []).map((q) => q.prompt),
  ];

  for (const example of examples) {
    // "en bil > bilen" shows a change: both sides are checked.
    for (const part of example.split(">")) {
      const { tokens } = analyse(vocabulary, report, {
        text: part,
        where: `pattern ${pattern.id} example "${example}"`,
        limit: lesson.index,
      });

      for (const token of tokens) {
        const viaChunk =
          token.c !== undefined &&
          lessonOfItem(vocabulary, token.c) <= lesson.index;

        // A word inside a chunk that is already taught is fine as it is.
        if (viaChunk || token.w === undefined) {
          continue;
        }

        const taughtIn = lessonOfItem(vocabulary, token.w);

        if (taughtIn > lesson.index) {
          report.errors.push(
            `pattern ${pattern.id}: example "${example}" uses "${token.t}", which is taught later`
          );
        } else if (taughtIn < lesson.index) {
          needs.push(taughtIn);
        }
      }
    }
  }

  return needs;
};

/** The lesson a lesson follows when the author named none. */
const defaultNeed = (draft: Draft, lesson: Lesson, teachesPattern: boolean) => {
  if (teachesPattern) {
    return lesson.index - 1;
  }

  // The nearest earlier lesson that teaches a pattern, or the first lesson.
  const earlier = draft.lessons.slice(1, lesson.index);

  return (
    earlier.findLast((l) => l.items.some((id) => id.startsWith("p:")))?.index ??
    0
  );
};

/** Every lesson that must be finished before this one, directly or through another lesson. */
const reach = (
  lessons: Lesson[],
  from: number,
  seen = new Set<number>()
): Set<number> => {
  for (const need of lessons[from]?.needs ?? []) {
    if (!seen.has(need)) {
      reach(lessons, need, seen.add(need));
    }
  }

  return seen;
};

/**
 * Fills in `needs` of every lesson of the draft.
 * Goes through the lessons in order, because a lesson's needs build on those of the lessons before it.
 */
export const resolveLessonNeeds = (
  draft: Draft,
  vocabulary: Vocabulary,
  report: Report
) => {
  for (const lesson of draft.lessons) {
    const written = draft.lessonNeeds[lesson.index] ?? [];
    const needs = new Set(writtenNeeds(draft, report, lesson, written));

    const patterns = lesson.items.flatMap((id) => {
      const item = draft.info.get(id)?.item;

      return item?.kind === "pattern" ? [item] : [];
    });

    for (const pattern of patterns) {
      for (const need of [
        ...patternNeeds(draft, report, lesson, pattern),
        ...exampleNeeds(vocabulary, report, lesson, pattern),
      ]) {
        needs.add(need);
      }
    }

    if (written.length === 0 && lesson.index > 0) {
      needs.add(defaultNeed(draft, lesson, patterns.length > 0));
    }

    // Drop needs already implied by another need.
    const direct = [...needs].filter((need) => need < lesson.index);

    lesson.needs = direct
      .filter(
        (need) =>
          !direct.some(
            (other) => other !== need && reach(draft.lessons, other).has(need)
          )
      )
      .toSorted((a, b) => a - b);
  }
};
