import { expect, test } from "bun:test";

import { createScheduler, introduce, review } from "@norsk/engine";
import type { Mem } from "@norsk/engine";
import { course } from "@norsk/norwegian";

import {
  greetingAt,
  newDetail,
  reviewDetail,
  storyDetail,
  summaryOf,
  todayOf,
} from "./today-plan";

const { item, items } = course;

test("the greeting follows the hour", () => {
  expect(greetingAt(9, course.meta.greetings).target).toBe("God morgen");
  expect(greetingAt(10, course.meta.greetings).target).toBe("God dag");
  expect(greetingAt(17, course.meta.greetings).base).toBe("Good day");
  expect(greetingAt(18, course.meta.greetings).target).toBe("God kveld");
});

test("the summary names reviews and new material", () => {
  const word = item("c:hei");
  const pattern = item("p:present");

  expect(summaryOf(0, null)).toBe("Nothing is due right now.");
  expect(summaryOf(0, word)).toBe("new words to learn.");
  expect(summaryOf(1, null)).toBe("1 review.");
  expect(summaryOf(3, pattern)).toBe("3 reviews and one new pattern.");
});

test("the review line says how few reviews cover the due items", () => {
  expect(reviewDetail(0, { due: 0, tasks: 0 })).toBe("Nothing is due.");
  expect(reviewDetail(1, { due: 1, tasks: 1 })).toBe("1 item is due.");
  expect(reviewDetail(8, { due: 8, tasks: 3 })).toBe(
    "8 items are due. 3 reviews cover 8 of them."
  );
});

test("the other lines say what comes next, or that nothing does", () => {
  expect(newDetail(course, null, null)).toBe("You have learned every lesson.");
  expect(storyDetail(null)).toBe("A story unlocks after a few more lessons.");
});

test("progress to the level counts every item of it seen, and counts it more the better it is known", async () => {
  const scheduler = await createScheduler(0.9);
  const start = new Date("2026-01-01T08:00:00Z").getTime();
  const total = Object.keys(items).length;

  const viewOf = (mems: Mem[], now: number) =>
    todayOf({
      course,
      chosenLesson: null,
      memory: new Map(mems.map((mem) => [mem.id, mem])),
      now,
      scheduler,
      sentenceSeen: {},
      storiesDone: [],
    });

  const empty = viewOf([], start);

  expect(empty.progress).toBe(0);
  expect(empty.seen).toBe(0);
  expect(empty.total).toBe(total);
  // Everything written so far is A1, which is where a new learner starts. The levels after it are locked.
  expect(empty.level.id).toBe("A1");
  expect(empty.levels.map((step) => [step.id, step.state])).toEqual([
    ["A1", "open"],
    ["A2", "locked"],
    ["B1", "locked"],
  ]);

  const fresh = introduce(scheduler, "c:hei", start);
  const one = viewOf([fresh], start);

  expect(one.seen).toBe(1);
  expect(one.stable).toBe(0);
  expect(one.progress).toBeGreaterThan(0);
  // Seen once is far from known: the item has only a part of its credit.
  expect(one.progress).toBeLessThan(0.5 / total);

  // The passes of the first minutes finish the learning steps. A pass days later adds credit.
  const day = 86_400_000;

  let practised = fresh;

  for (const after of [5 * 60_000, 20 * 60_000, 4 * day]) {
    practised = review(scheduler, practised, "good", start + after);
  }

  expect(viewOf([practised], start).progress).toBeGreaterThan(one.progress);
});
