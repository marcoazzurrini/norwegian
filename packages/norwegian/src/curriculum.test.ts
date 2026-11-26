// Checks the committed curriculum through the public interface: its shape, and that every reference in it holds.
import { describe, expect, test } from "bun:test";

import { CurriculumSchema, sentenceReady } from "@norsk/course";
import type { ItemKind, Quiz, Token } from "@norsk/course";
import * as v from "valibot";

// The .js is spelled out so every tool picks the same file: see curriculum-data.d.ts.
import curriculum from "./curriculum-data.js";
import { course } from "./index";

const {
  exampleOf,
  item,
  items,
  lessonOf,
  lessons,
  levelItems,
  levelLessons,
  levelOf,
  levels,
  sentenceItems,
  sentences,
  sentencesWith,
  stories,
  sounds,
  storyById,
  units,
  unlockedBy,
} = course;

const allItems = Object.values(items);

/** The values that occur more than once. */
const duplicates = (values: readonly (number | string)[]) =>
  values.filter((value, i) => values.indexOf(value) !== i);

/** Whether the id names an item of this kind. */
const isKind = (id: string, kind: ItemKind) => items[id]?.kind === kind;

/** Problems with the item references of one token, each named after where the token is. */
const tokenProblems = (token: Token, where: string): string[] => {
  const problems: string[] = [];

  if (token.w !== undefined && !isKind(token.w, "word")) {
    problems.push(`${where}: "${token.t}" names word ${token.w}`);
  }

  if (token.c !== undefined && !isKind(token.c, "chunk")) {
    problems.push(`${where}: "${token.t}" names chunk ${token.c}`);
  }

  for (const p of token.p ?? []) {
    if (!isKind(p, "pattern")) {
      problems.push(`${where}: "${token.t}" names pattern ${p}`);
    }
  }

  return problems;
};

const quizzes: { where: string; quiz: Quiz }[] = [
  ...allItems.flatMap((it) =>
    (it.quiz ?? []).map((quiz) => ({ quiz, where: it.id }))
  ),
  ...stories.flatMap((story) =>
    story.questions.map((quiz) => ({ quiz, where: story.id }))
  ),
];

describe("the committed curriculum", () => {
  test("passes the schema", () => {
    const result = v.safeParse(CurriculumSchema, curriculum);

    expect(result.issues?.map((issue) => issue.message) ?? []).toEqual([]);
  });

  test("has unique ids", () => {
    expect(duplicates(sentences.map((s) => s.id))).toEqual([]);
    expect(duplicates(stories.map((s) => s.id))).toEqual([]);
    expect(duplicates(sounds.map((s) => s.id))).toEqual([]);
    expect(duplicates(units.map((u) => u.index))).toEqual([]);
  });

  test("files every item under its own id", () => {
    const misfiled = Object.entries(items)
      .filter(([id, it]) => it.id !== id)
      .map(([id]) => id);

    expect(misfiled).toEqual([]);
  });

  test("numbers the lessons by their position", () => {
    expect(lessons.map((l) => l.index)).toEqual([...lessons.keys()]);
  });

  test("puts every lesson in exactly the unit it names", () => {
    const listed = units.flatMap((u) =>
      u.lessons.map((index) => ({ index, unit: u.index }))
    );

    expect(duplicates(listed.map((l) => l.index))).toEqual([]);
    expect(listed.toSorted((a, b) => a.index - b.index)).toEqual(
      lessons.map((l) => ({ index: l.index, unit: l.unit }))
    );
  });

  test("puts every item in exactly the lesson that lists it", () => {
    const listed = lessons.flatMap((l) =>
      l.items.map((id) => ({ id, lesson: l.index }))
    );

    expect(duplicates(listed.map((l) => l.id))).toEqual([]);
    expect(listed.filter((l) => items[l.id]?.lesson !== l.lesson)).toEqual([]);
    expect(listed).toHaveLength(allItems.length);
  });

  test("makes every lesson need only earlier lessons", () => {
    const bad = lessons.flatMap((l) =>
      l.needs
        .filter((need) => !(need >= 0 && need < l.index))
        .map((need) => `lesson ${l.index} needs ${need}`)
    );

    expect(bad).toEqual([]);
  });

  test("has no cycle in what lessons need", () => {
    // Remove lessons whose needs are all met, again and again. Lessons in a cycle are never removed.
    const done = new Set<number>();
    let waiting = lessons.map((l) => l.index);
    let before = -1;

    while (waiting.length !== before) {
      before = waiting.length;

      for (const index of waiting) {
        if (lessons[index]?.needs.every((need) => done.has(need)) === true) {
          done.add(index);
        }
      }

      waiting = waiting.filter((index) => !done.has(index));
    }

    expect(waiting).toEqual([]);
  });

  test("makes every pattern need only patterns that exist", () => {
    const bad = allItems.flatMap((it) =>
      (it.needs ?? [])
        .filter((need) => !isKind(need, "pattern"))
        .map((need) => `${it.id} needs ${need}`)
    );

    expect(bad).toEqual([]);
  });

  test("gives every pattern two sentences to come back in once its lesson is done", () => {
    // A pattern has no card: it is recalled inside sentences only. A pattern that was missed
    // comes back in another sentence than the one it was missed in, so it needs two at least.
    const short = allItems
      .filter((it) => it.kind === "pattern")
      .flatMap((it) => {
        const taught = new Set(
          lessons.slice(0, it.lesson + 1).flatMap((l) => l.items)
        );

        const usable = sentencesWith(it.id).filter((s) =>
          sentenceReady(s, taught)
        );

        return usable.length < 2 ? [`${it.id}: ${usable.length}`] : [];
      });

    expect(short).toEqual([]);
  });

  test("uses only known items and units in sentences", () => {
    const bad = sentences.flatMap((s) => [
      ...s.tokens.flatMap((token) => tokenProblems(token, s.id)),
      ...s.patterns
        .filter((p) => !isKind(p, "pattern"))
        .map((p) => `${s.id}: names pattern ${p}`),
      ...(units.some((u) => u.index === s.unit) ? [] : [`${s.id}: no unit`]),
    ]);

    expect(bad).toEqual([]);
  });

  test("uses only known items and units in stories", () => {
    const bad = stories.flatMap((story) => [
      ...story.lines.flatMap((line) =>
        line.tokens.flatMap((token) => tokenProblems(token, story.id))
      ),
      ...(units.some((u) => u.index === story.unit)
        ? []
        : [`${story.id}: no unit`]),
    ]);

    expect(bad).toEqual([]);
  });

  test("gives an item an example that shows it in use, made of what is taught before it", () => {
    const taught = new Set<string>();
    const bad: string[] = [];

    // In course order, so `taught` holds the item itself and everything before it.
    for (const lesson of lessons) {
      for (const id of lesson.items) {
        taught.add(id);

        const it = item(id);
        const example = exampleOf(it);

        if (example !== null) {
          const inUse =
            it.kind === "chunk"
              ? example.tokens.some((t) => t.c === id) &&
                example.tokens.some((t) => t.c !== id)
              : example.tokens.some((t) => t.w === id && t.c === undefined);

          if (
            it.kind === "pattern" ||
            !inUse ||
            !sentenceReady(example, taught)
          ) {
            bad.push(`${id}: ${example.target}`);
          }
        }
      }
    }

    expect(bad).toEqual([]);
  });

  test("leaves only words of the first unit without an example", () => {
    const [first] = units;

    const late = allItems
      .filter(
        (it) =>
          it.kind === "word" &&
          exampleOf(it) === null &&
          lessonOf(it.id).unit !== first?.index
      )
      .map((it) => it.id);

    expect(late).toEqual([]);
  });

  test("gives every word and chunk at least one answer", () => {
    // A pattern is practised with quizzes and sentences, never typed, so it has no answers.
    const bad = allItems
      .filter((it) => it.kind !== "pattern" && it.answers.length === 0)
      .map((it) => it.id);

    expect(bad).toEqual([]);
  });

  test("gives every quiz at least two options", () => {
    const bad = quizzes.flatMap(({ where, quiz }) =>
      quiz.options.length < 2 ? [`${where}: ${quiz.prompt}`] : []
    );

    expect(quizzes.length).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });
});

describe("lookups", () => {
  test("item returns the item with that id", () => {
    for (const it of allItems) {
      expect(item(it.id)).toBe(it);
    }
  });

  test("lessonOf returns the lesson that lists the item", () => {
    const bad = allItems
      .filter((it) => !lessonOf(it.id).items.includes(it.id))
      .map((it) => it.id);

    expect(bad).toEqual([]);
  });

  test("unlockedBy returns the lessons that need a lesson", () => {
    for (const lesson of lessons) {
      const expected = lessons.filter((l) => l.needs.includes(lesson.index));

      expect(unlockedBy(lesson.index)).toEqual(expected);
    }
  });

  test("sentencesWith agrees with sentenceItems", () => {
    for (const it of allItems) {
      const expected = sentences.filter((s) =>
        sentenceItems(s).includes(it.id)
      );

      expect(sentencesWith(it.id)).toEqual(expected);
    }
  });

  test("sentenceItems lists each item of a sentence once", () => {
    const bad = sentences
      .filter((s) => duplicates(sentenceItems(s)).length > 0)
      .map((s) => s.id);

    expect(bad).toEqual([]);
  });

  test("storyById finds a story, and returns undefined for an unknown id", () => {
    for (const story of stories) {
      expect(storyById(story.id)).toBe(story);
    }

    expect(storyById("no-such-story")).toBeUndefined();
  });

  test("exampleOf returns the sentence an item names, and null for an item that names none", () => {
    const hus = item("w:hus:noun");

    expect(exampleOf(hus)?.id).toBe(hus.exampleId);
    expect(exampleOf(hus)?.tokens.some((t) => t.w === hus.id)).toBe(true);
    expect(exampleOf(item("p:gender"))).toBeNull();
  });

  test("an unknown id is an error", () => {
    expect(() => item("w:no-such-word:noun")).toThrow("Unknown item");
    expect(() => lessonOf("w:no-such-word:noun")).toThrow("Unknown item");
    expect(() => sentencesWith("w:no-such-word:noun")).toThrow("Unknown item");
    expect(() => unlockedBy(lessons.length)).toThrow("Unknown lesson");
    expect(() => unlockedBy(-1)).toThrow("Unknown lesson");
    // A name every object inherits is still not an item.
    expect(() => item("constructor")).toThrow("Unknown item");
  });
});

describe("levels", () => {
  test("every unit is in exactly one level, the one it names", () => {
    expect(levels.flatMap((level) => level.units)).toEqual(
      units.map((unit) => unit.index)
    );

    for (const unit of units) {
      expect(levelOf(unit.index).id).toBe(unit.level);
    }
  });

  test("the lessons and items of the levels together are the whole course", () => {
    expect(levels.flatMap((level) => levelLessons(level))).toEqual(lessons);
    expect(levels.flatMap((level) => levelItems(level)).toSorted()).toEqual(
      Object.keys(items).toSorted()
    );
  });
});
