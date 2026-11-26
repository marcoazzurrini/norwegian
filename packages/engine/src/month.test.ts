// A simulated month: scheduling, selection, sessions and the task machines, tested together.
// A learner studies fifteen minutes every day for thirty days and answers right 85% of the time.
import { describe, expect, test } from "bun:test";

import { REVIEW_SHARE, isRealItem, simulate } from "./simulation";
import type { Options, TaskRecord } from "./simulation";

const MINUTE = 60_000;

/** With this many reviews due, a session teaches nothing new. */
const BACKLOG = 40;

/**
 * How far into a session of this length new material is taught: its first half. A session this
 * short has no room for the waits a new item needs before its recalls.
 */
const TEACH_UNTIL = 0.5;

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

  test("a session ends within a minute of its time budget", () => {
    // Once the time is used up, a session only gives the recalls it owes.
    expect(
      run.tasks.filter(
        (t) => t.elapsedBefore >= month.minutes * MINUTE && !t.closing
      )
    ).toEqual([]);

    for (const d of run.days) {
      expect(d.elapsedMs).toBeLessThan(d.budgetMs + MINUTE);
      expect(d.budgetMs).toBe(month.minutes * MINUTE);
    }

    expect(run.tasks.every((t) => t.ms > 0 && t.ms <= MAX_TASK_MS)).toBe(true);
  });

  test("while there is new material, a session teaches for as long as it may", () => {
    const total = run.days.at(-1)?.learned ?? 0;
    const busy = run.days.filter((d) => d.learned < total);

    expect(busy.length).toBeGreaterThan(10);
    expect(busy.filter((d) => !d.timeUp)).toEqual([]);

    // After that it may end early: nothing new is started that could not be finished.
    expect(
      busy.filter((d) => d.elapsedMs < d.budgetMs * TEACH_UNTIL - MINUTE)
    ).toEqual([]);
  });

  test("nothing new is taught in the second half of a short session", () => {
    expect(
      run.tasks.filter(
        (t) =>
          isNew(t) && t.elapsedBefore >= month.minutes * MINUTE * TEACH_UNTIL
      )
    ).toEqual([]);
  });

  test("a session closes with recalls of what is still being learned, each item once", () => {
    for (const d of run.days) {
      const tasks = run.tasks.filter((t) => t.day === d.day);
      const closing = tasks.filter((t) => t.closing);
      const owed = closing.map((t) => t.subject);

      // Once a session closes, it does nothing else.
      expect(tasks.slice(tasks.length - closing.length)).toEqual(closing);
      expect(
        closing.filter((t) => t.type !== "card" && t.type !== "sentence")
      ).toEqual([]);
      expect(new Set(owed).size).toBe(owed.length);
    }

    expect(run.tasks.some((t) => t.closing)).toBe(true);
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

  test("due reviews come before new material, until reviews have had their share of the time for teaching", () => {
    const share = REVIEW_SHARE * TEACH_UNTIL * month.minutes * MINUTE;
    const withDue = run.tasks.filter((t) => isNew(t) && t.dueReviews > 0);

    // New material with reviews still due is allowed for one reason only: reviews have had their share.
    expect(withDue.length).toBeGreaterThan(0);
    expect(
      withDue.filter((t) => t.reviewable && t.reviewMsBefore < share)
    ).toEqual([]);
  });

  test("an item that waits to be learned again is recalled in the next session", () => {
    const waiting = run.days.flatMap((d) => d.learningDue);

    const forgotten = run.days.flatMap((d) => {
      const recalled = new Set(
        run.tasks
          .filter((t) => t.day === d.day)
          .flatMap((t) => t.result.itemIds)
      );

      return d.learningDue
        .filter((id) => !recalled.has(id))
        .map((id) => `day ${d.day}: ${id}`);
    });

    // Words wait on their cards and patterns inside sentences: both kinds must come back.
    expect(waiting.some((id) => id.startsWith("p:"))).toBe(true);
    expect(waiting.some((id) => id.startsWith("w:"))).toBe(true);
    expect(forgotten).toEqual([]);
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

  // Ten days are enough to show this, and cost a tenth of a month.
  test("the same seed gives the same days, another seed different ones", async () => {
    const tenDays: Options = { ...month, days: 10 };
    const first = JSON.stringify(await simulate(tenDays));
    const again = JSON.stringify(await simulate(tenDays));
    const other = JSON.stringify(await simulate({ ...tenDays, seed: 8 }));

    expect(again).toBe(first);
    expect(other).not.toBe(first);
  });
});

// A pattern is practised in sentences when it is taught, and it comes back in another sentence,
// which the lesson often cannot offer before its words are taught.
const isPattern = (id: string): boolean => id.startsWith("p:");

describe("every word and phrase taught in a session is recalled again before the session ends", () => {
  for (const minutes of [5, 15, 25, 40]) {
    test(`in a session of ${minutes} minutes`, async () => {
      const days = await simulate({ ...month, days: 10, minutes });

      const notRecalled = days.tasks.flatMap((task, i) =>
        task.taught
          .filter(
            (id) =>
              !isPattern(id) &&
              !days.tasks
                .slice(i + 1)
                .some((t) => t.day === task.day && t.answered.includes(id))
          )
          .map((id) => `day ${task.day}: ${id}`)
      );

      expect(days.tasks.flatMap((t) => t.taught).length).toBeGreaterThan(30);
      expect(notRecalled).toEqual([]);

      for (const d of days.days) {
        expect(d.elapsedMs).toBeLessThan(d.budgetMs + 1.5 * MINUTE);
      }
    });
  }
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
