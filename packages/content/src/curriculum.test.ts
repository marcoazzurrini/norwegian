// Checks the committed curriculum through the public interface: its shape, and that every reference in it holds.
import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import {
  CurriculumSchema,
  curriculum,
  item,
  items,
  lessonOf,
  lessons,
  sentenceItems,
  sentences,
  sentencesWith,
  stories,
  sounds,
  storyById,
  units,
  unlockedBy,
} from "./index";
import type { ItemKind, Quiz, Token } from "./index";

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
