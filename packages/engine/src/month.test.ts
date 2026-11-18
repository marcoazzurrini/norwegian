// A simulated month: scheduling, selection, sessions and the task machines, tested together.
// A learner studies fifteen minutes every day for thirty days and answers right 85% of the time.
import { describe, expect, test } from "bun:test";

import { REVIEW_SHARE, isRealItem, simulate } from "./simulation";
import type { Options, TaskRecord } from "./simulation";

const MINUTE = 60_000;

/** With this many reviews due, a session teaches nothing new. */
const BACKLOG = 40;

/** The longest time a single task can add to a session. */
const MAX_TASK_MS = 3 * MINUTE;

const month: Options = { accuracy: 0.85, days: 30, minutes: 15, seed: 7 };

const run = await simulate(month);

const isNew = (t: TaskRecord): boolean =>
  t.type === "intro" || t.type === "pattern";

/** Each task paired with the one before it in the same session. */
const inARow = (tasks: TaskRecord[]): [TaskRecord, TaskRecord][] =>
  tasks.flatMap((task, i): [TaskRecord, TaskRecord][] => {
    const before = tasks[i - 1];

    return before !== undefined && before.day === task.day
      ? [[before, task]]
      : [];
  });

describe("a month of daily study", () => {
  test("the learner studies every day and does every kind of task", () => {
    expect(run.days.map((d) => d.day)).toEqual(
      Array.from({ length: month.days }, (_, day) => day)
    );
    expect(run.days.every((d) => d.tasks > 0)).toBe(true);
    expect(new Set(run.tasks.map((t) => t.type))).toEqual(
      new Set(["sound", "intro", "pattern", "card", "sentence", "story"])
    );
  });

  test("a session stays within its time budget", () => {
    // No task starts once the time is used up, so a session runs over by one task at most.
    expect(
      run.tasks.filter((t) => t.elapsedBefore >= month.minutes * MINUTE)
    ).toEqual([]);

    for (const d of run.days) {
      expect(d.elapsedMs).toBeLessThan(d.budgetMs + MAX_TASK_MS);
      expect(d.budgetMs).toBe(month.minutes * MINUTE);
    }

    expect(run.tasks.every((t) => t.ms > 0 && t.ms <= MAX_TASK_MS)).toBe(true);
  });

  test("while there is new material, a session uses all of its time", () => {
    const total = run.days.at(-1)?.learned ?? 0;
    const busy = run.days.filter((d) => d.learned < total);

    expect(busy.length).toBeGreaterThan(10);
    expect(busy.filter((d) => d.elapsedMs < d.budgetMs)).toEqual([]);
  });

  test("no lesson is taught before the lessons it needs are finished", () => {
    const fresh = run.tasks.filter((t) => isNew(t));

    expect(fresh.length).toBeGreaterThan(100);
    expect(fresh.filter((t) => !t.prerequisitesDone)).toEqual([]);
  });

  test("an item is taught once, by a task that teaches", () => {
    const taught = run.tasks.flatMap((t) => t.taught);

    expect(new Set(taught).size).toBe(taught.length);
    expect(run.tasks.filter((t) => !isNew(t) && t.taught.length > 0)).toEqual(
      []
    );
    expect(taught.toSorted()).toEqual(run.memory.map((m) => m.id).toSorted());
  });

  test("the same card never comes twice in a row, and a sentence once per session at most", () => {
    const repeats = inARow(run.tasks).filter(
      ([before, task]) =>
        task.type === "card" &&
        before.type === "card" &&
        before.subject === task.subject
    );

    expect(repeats).toEqual([]);

    const sentences = run.tasks
      .filter((t) => t.type === "sentence")
      .map((t) => `${t.day} ${t.subject}`);

    expect(sentences.length).toBeGreaterThan(100);
    expect(new Set(sentences).size).toBe(sentences.length);
  });

  test("due reviews come before new material, until reviews have had their share of the session", () => {
    const share = REVIEW_SHARE * month.minutes * MINUTE;
    const withDue = run.tasks.filter((t) => isNew(t) && t.dueReviews > 0);

    // New material with reviews still due is allowed for one reason only: reviews have had their share.
    expect(withDue.length).toBeGreaterThan(0);
    expect(
      withDue.filter((t) => t.reviewable && t.reviewMsBefore < share)
    ).toEqual([]);
  });

  test("memory holds only real items, and no review is recorded for an item the learner does not have", () => {
    expect(run.memory.filter((m) => !isRealItem(m.id))).toEqual([]);
    expect(run.unknownReviews).toBe(0);
    expect(
      run.tasks.flatMap((t) => t.result.itemIds).filter((id) => !isRealItem(id))
    ).toEqual([]);
  });

  test("the number of learned items grows and never shrinks", () => {
    const learned = run.days.map((d) => d.learned);

    expect(learned.toSorted((a, b) => a - b)).toEqual(learned);
    expect(learned[0]).toBeGreaterThan(0);
    expect(learned[6]).toBeGreaterThan(learned[0] ?? 0);
    expect(learned.at(-1)).toBeGreaterThan(200);
  });

  test("the statistics of a session add up to its tasks", () => {
    for (const d of run.days) {
      const tasks = run.tasks.filter((t) => t.day === d.day);

      const sum = (pick: (t: TaskRecord) => number): number =>
        tasks.reduce((total, t) => total + pick(t), 0);

      expect(d.tasks).toBe(tasks.length);
      expect(d.elapsedMs).toBe(sum((t) => t.ms));
      expect(d.stats.taught).toBe(sum((t) => t.taught.length));
      expect(d.stats.right).toBe(sum((t) => t.result.right));
      expect(d.stats.wrong).toBe(sum((t) => t.result.wrong));
    }
  });

  test("average recall stays close to the 90% the scheduler aims for", () => {
    const recall = run.days.flatMap((d) => d.recallAtStart ?? []);

    expect(recall).toHaveLength(month.days - 1);
    expect(Math.min(...recall)).toBeGreaterThan(0.85);
    expect(Math.max(...recall)).toBeLessThan(0.99);
  });

  test("the same seed gives the same month, another seed a different one", async () => {
    const again = await simulate(month);
    const other = await simulate({ ...month, seed: 8 });

    expect(JSON.stringify(again)).toBe(JSON.stringify(run));
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(run));
  });
});

describe("coming back after two weeks away", () => {
  test("a backlog of reviews pauses new material until it is worked down", async () => {
    const away = Array.from({ length: 14 }, (_, i) => 10 + i);
    const back = await simulate({ ...month, days: 27, daysOff: away });
    const firstTask = back.tasks.find((t) => t.day === 24);
    const before = back.days.find((d) => d.day === 9);
    const after = back.days.find((d) => d.day === 24);

    expect(back.days).toHaveLength(13);
    expect(firstTask?.dueReviews).toBeGreaterThanOrEqual(BACKLOG);
    expect(
      back.tasks.filter((t) => isNew(t) && t.dueReviews >= BACKLOG)
    ).toEqual([]);

    // Two weeks without study cost some recall, and the first day back goes to reviews.
    expect(after?.recallAtStart ?? 1).toBeLessThan(before?.recallAtStart ?? 0);
    expect(after?.stats.reviewed ?? 0).toBeGreaterThan(
      after?.stats.taught ?? 0
    );
  });
});
