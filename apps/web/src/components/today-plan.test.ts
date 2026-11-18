import { expect, test } from "bun:test";

import { item } from "@norsk/content";

import {
  greetingAt,
  newDetail,
  reviewDetail,
  storyDetail,
  summaryOf,
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
