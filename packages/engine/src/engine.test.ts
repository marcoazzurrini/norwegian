import { describe, expect, test } from "bun:test";

import { item, lessons, sentences } from "@norsk/content";
import type { Sentence } from "@norsk/content";

import {
  Session,
  compression,
  createScheduler,
  dueItems,
  gradeCard,
  gradeSentence,
  introduce,
  lessonState,
  nextLesson,
  pickReview,
  retrievability,
  review,
  sentenceReady,
} from "./index";
import type { Mem, SessionView } from "./index";

const DAY = 86_400_000;
const T0 = new Date("2026-01-01T08:00:00Z").getTime();

const find = (no: string): Sentence => {
  const found = sentences.find((s) => s.no === no);

  if (found === undefined) {
    throw new Error(`No sentence "${no}"`);
  }

  return found;
};

const lessonAt = (index: number) => {
  const found = lessons[index];

  if (found === undefined) {
    throw new Error(`No lesson ${index}`);
  }

  return found;
};

const isLearning = (m: Mem): boolean => m.card.scheduleStatus !== "review";

const view = (memory: Map<string, Mem>): SessionView => ({
  chosenLesson: null,
  memory,
  soundStats: {},
  storiesDone: new Set(),
});

describe("grading a sentence", () => {
  const s = find("Huset er stort.");

  test("accepts the exact answer without punctuation or capitals", () => {
    expect(gradeSentence(s, "huset er stort").correct).toBe(true);
  });

  test("marks only the wrong word", () => {
    const g = gradeSentence(s, "Huset er stor");
    expect(g.correct).toBe(false);
    expect(g.typed.map((t) => t.ok)).toEqual([true, true, false]);
    expect(g.missed).toEqual([2]);
  });

  test("a missing word does not make the following words wrong", () => {
    const g = gradeSentence(
      find("Jeg snakker ikke norsk."),
      "jeg snakker norsk"
    );

    expect(g.missed).toEqual([2]);
    expect(g.typed.every((t) => t.ok)).toBe(true);
  });

  test("detects right words in the wrong order", () => {
    const g = gradeSentence(
      find("I dag jobber jeg hjemme."),
      "i dag jeg jobber hjemme"
    );

    expect(g.correct).toBe(false);
    expect(g.orderOnly).toBe(true);
  });

  test("accepts the other spelling of a feminine noun", () => {
    expect(gradeSentence(find("Boka er der."), "boken er der").correct).toBe(
      true
    );
    expect(
      gradeSentence(find("Hun har ei bok."), "hun har en bok").correct
    ).toBe(true);
  });

  test("accepts a listed alternative sentence", () => {
    expect(
      gradeSentence(
        find("Jeg kan dessverre ikke komme."),
        "Dessverre kan jeg ikke komme"
      ).correct
    ).toBe(true);
  });
});

describe("grading a single card", () => {
  test("a noun needs its en, ei or et", () => {
    const hus = item("w:hus:noun");
    expect(gradeCard(hus, "et hus").correct).toBe(true);
    expect(gradeCard(hus, "en hus")).toEqual({
      correct: false,
      wrongArticle: true,
    });
    expect(gradeCard(hus, "hytte")).toEqual({
      correct: false,
      wrongArticle: false,
    });
  });

  test("a verb is accepted with or without å", () => {
    expect(gradeCard(item("w:snakke:verb"), "å snakke").correct).toBe(true);
    expect(gradeCard(item("w:snakke:verb"), "snakke").correct).toBe(true);
  });

  test("a chunk with a slot is typed without the slot", () => {
    expect(gradeCard(item("c:jeg-heter"), "Jeg heter").correct).toBe(true);
  });
});

describe("memory", () => {
  test("a new item comes back within minutes, then moves to days", async () => {
    const s = await createScheduler(0.9);
    let m = introduce(s, "w:hus:noun", T0);
    expect(isLearning(m)).toBe(true);
    expect(new Date(m.card.dueAt).getTime() - T0).toBeLessThanOrEqual(
      15 * 60_000
    );
    m = review(s, m, "good", T0 + 5 * 60_000);
    m = review(s, m, "good", T0 + 20 * 60_000);
    expect(isLearning(m)).toBe(false);
    expect(new Date(m.card.dueAt).getTime() - T0).toBeGreaterThan(DAY);
  });

  test("a pass inside a sentence earns less than a pass on its own card", async () => {
    const s = await createScheduler(0.9);
    let m = introduce(s, "w:hus:noun", T0);
    m = review(s, m, "good", T0 + 5 * 60_000);
    m = review(s, m, "good", T0 + 20 * 60_000);
    const later = T0 + 4 * DAY;
    const direct = review(s, m, "good", later);
    const carried = review(s, m, "good", later, true);
    expect(carried.card.stability).toBeGreaterThan(m.card.stability);
    expect(carried.card.stability).toBeLessThan(direct.card.stability);
    expect(new Date(carried.card.dueAt).getTime()).toBeLessThanOrEqual(
      new Date(direct.card.dueAt).getTime()
    );
  });

  test("a miss sends the item back to relearning", async () => {
    const s = await createScheduler(0.9);
    let m = introduce(s, "w:hus:noun", T0);
    m = review(s, m, "good", T0 + 5 * 60_000);
    m = review(s, m, "good", T0 + 20 * 60_000);
    const missed = review(s, m, "again", T0 + 4 * DAY);
    expect(isLearning(missed)).toBe(true);
    expect(missed.card.stability).toBeLessThan(m.card.stability);
    expect(retrievability(s, m, T0 + 30 * DAY)).toBeLessThan(
      retrievability(s, m, T0 + DAY)
    );
  });
});

/** Teaches every item of the given lessons and reviews each once on its own card, three days later. */
const taught = async (
  lessonIndexes: number[],
  at: number
): Promise<Map<string, Mem>> => {
  const s = await createScheduler(0.9);
  const mem = new Map<string, Mem>();

  for (const li of lessonIndexes) {
    for (const id of lessonAt(li).items) {
      let m = introduce(s, id, at);
      m = review(s, m, "good", at + 5 * 60_000);
      m = review(s, m, "good", at + 20 * 60_000);
      m = review(s, m, "good", at + 3 * DAY);
      mem.set(id, m);
    }
  }

  return mem;
};

describe("choosing what to do", () => {
  test("lessons unlock in order of their needs", () => {
    const mem = new Map<string, Mem>();
    expect(lessonState(lessonAt(0), mem)).toBe("ready");
    expect(lessonState(lessonAt(1), mem)).toBe("locked");
    expect(nextLesson(mem)?.index).toBe(0);
  });

  test("a sentence is usable only when all its words are taught", async () => {
    const s = find("Jeg snakker ikke norsk.");
    expect(sentenceReady(s, await taught([0, 1, 2], T0))).toBe(false);
    expect(sentenceReady(s, await taught([0, 1, 2, 3], T0))).toBe(true);
  });

  test("one sentence review covers several due items", async () => {
    const mem = await taught([0, 1, 2, 3, 4, 5, 6], T0);
    const now = T0 + 40 * DAY;
    const due = dueItems(mem, now).review.length;
    expect(due).toBeGreaterThan(20);
    const pick = pickReview(mem, now, new Set());
    expect(pick?.type).toBe("sentence");

    if (pick?.type === "sentence") {
      expect(pick.covers.length).toBeGreaterThanOrEqual(4);
    }

    const c = compression(mem, now);
    expect(c.due).toBe(due);
    expect(c.tasks).toBeLessThan(due * 0.7);
  });
});

describe("a session", () => {
  test("a short first session starts teaching straight away", () => {
    const session = new Session(5, () => 0.3);
    const task = session.next(view(new Map()), T0);
    expect(task.type).toBe("intro");

    if (task.type === "intro") {
      expect(task.items.map((i) => i.id)).toEqual(
        lessonAt(0).items.slice(0, task.items.length)
      );
    }
  });

  test("a longer session starts with sounds", () => {
    const session = new Session(25, () => 0.3);
    expect(session.next(view(new Map()), T0).type).toBe("sound");
  });

  test("reviews come before new material, and the session ends when time is up", async () => {
    const mem = await taught([0, 1, 2, 3], T0);
    const session = new Session(5, () => 0.3);
    const now = T0 + 40 * DAY;
    expect(session.next(view(mem), now).type).toBe("sentence");
    session.record(5 * 60_000, "review");
    expect(session.next(view(mem), now).type).toBe("done");
  });

  test("new material gets time even when reviews are waiting", async () => {
    const mem = await taught([0, 1, 2, 3], T0);
    const session = new Session(5, () => 0.3);
    const now = T0 + 40 * DAY;
    session.record(3.5 * 60_000, "review");
    const task = session.next(view(mem), now);
    expect(["intro", "pattern"]).toContain(task.type);
  });
});
