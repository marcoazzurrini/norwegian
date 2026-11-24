import { expect, test } from "bun:test";

import { item, items } from "@norsk/content";
import { createScheduler, introduce, review } from "@norsk/engine";
import type { Mem } from "@norsk/engine";

import {
  greetingAt,
  newDetail,
  reviewDetail,
  storyDetail,
  summaryOf,
  todayOf,
} from "./today-plan";

test("the greeting follows the hour", () => {
  expect(greetingAt(9).norwegian).toBe("God morgen");
  expect(greetingAt(10).norwegian).toBe("God dag");
  expect(greetingAt(17).english).toBe("Good day");
  expect(greetingAt(18).norwegian).toBe("God kveld");
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
  expect(newDetail(null, null)).toBe("You have learned every lesson.");
  expect(storyDetail(null)).toBe("A story unlocks after a few more lessons.");
});

test("progress to A1 counts every item seen, and counts it more the better it is known", async () => {
  const scheduler = await createScheduler(0.9);
  const start = new Date("2026-01-01T08:00:00Z").getTime();
  const total = Object.keys(items).length;

  const viewOf = (mems: Mem[], now: number) =>
    todayOf({
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
