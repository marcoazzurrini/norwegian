import { expect, test } from "bun:test";

import { minutesLeft, sessionMinutes, summaryOf } from "./session-summary";

const MINUTE = 60_000;
const stats = { reviewed: 0, right: 0, taught: 0, wrong: 0 };

test("the length from the address is a number between 1 and 120", () => {
  expect(sessionMinutes(25)).toBe(25);
  expect(sessionMinutes(Number("5"))).toBe(5);
  expect(sessionMinutes(Number(undefined))).toBe(15);
  expect(sessionMinutes(Number("soon"))).toBe(15);
  expect(sessionMinutes(0)).toBe(15);
  expect(sessionMinutes(-3)).toBe(1);
  expect(sessionMinutes(500)).toBe(120);
});

test("the time left is rounded up to whole minutes", () => {
  expect(minutesLeft({ budgetMs: 5 * MINUTE, elapsedMs: 0 })).toBe(5);
  expect(minutesLeft({ budgetMs: 5 * MINUTE, elapsedMs: 1 })).toBe(5);
  expect(minutesLeft({ budgetMs: 5 * MINUTE, elapsedMs: MINUTE })).toBe(4);
  expect(minutesLeft({ budgetMs: 5 * MINUTE, elapsedMs: 9 * MINUTE })).toBe(0);
});

test("a session that ran out of time says so", () => {
  const summary = summaryOf({
    budgetMs: 5 * MINUTE,
    elapsedMs: 5 * MINUTE,
    stats: { reviewed: 7, right: 3, taught: 0, wrong: 1 },
  });

  expect(summary.closing).toBe("Finished. Your time is up.");
  expect(summary.spent).toBe(5);
  expect(summary.taughtNew).toBe(false);
  expect(summary.tiles).toEqual([
    { label: "minutes", value: 5 },
    { label: "new items", value: 0 },
    { label: "items reviewed", value: 7 },
    { label: "right first time", value: "75%" },
  ]);
});

test("a short session with nothing answered still counts one minute", () => {
  const summary = summaryOf({
    budgetMs: 5 * MINUTE,
    elapsedMs: 10_000,
    stats: { ...stats, taught: 3 },
  });

  expect(summary.closing).toBe("Finished. Nothing more is due right now.");
  expect(summary.taughtNew).toBe(true);
  expect(summary.tiles[0]).toEqual({ label: "minute", value: 1 });
  expect(summary.tiles[3]).toEqual({ label: "right first time", value: "–" });
});
