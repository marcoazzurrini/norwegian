import { describe, expect, test } from "bun:test";

import {
  item,
  lessons,
  sentenceReady,
  sentences,
  sentencesWith,
} from "@norsk/content";
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
  nextNewItems,
  pickReview,
  retrievability,
  review,
  strength,
} from "./index";
import type { Mem, PickLimits, SessionView } from "./index";

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

/** No sentence was used before, in this session or an earlier one. */
const FRESH: PickLimits = { seen: {}, skipSentences: new Set() };

const view = (memory: Map<string, Mem>): SessionView => ({
  chosenLesson: null,
  memory,
  sentenceSeen: {},
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
    // Two words that swapped places are both out of place.
    expect(g.misplaced).toEqual([2, 3]);
  });

  test("names the one word that moved when the others kept their order", () => {
    const g = gradeSentence(
      find("I dag jobber jeg hjemme."),
      "hjemme i dag jobber jeg"
    );

    expect(g.misplaced).toEqual([4]);
    expect(
      gradeSentence(find("Jeg snakker ikke norsk."), "jeg snakker norsk")
        .misplaced
    ).toEqual([]);
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

  test("an item counts a little from its first recall, more with every pass, and in full once it is stable", async () => {
    const s = await createScheduler(0.9);
    let m = introduce(s, "w:hus:noun", T0);
    const first = strength(m);

    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.5);

    m = review(s, m, "good", T0 + 5 * 60_000);
    m = review(s, m, "good", T0 + 20 * 60_000);

    let now = T0 + 4 * DAY;
    let before = first;

    // Each review comes when the item is due. A handful of them make the item stable.
    for (let pass = 0; pass < 6 && strength(m) < 1; pass += 1) {
      m = review(s, m, "good", now);
      expect(strength(m)).toBeGreaterThan(before);
      before = strength(m);
      now = new Date(m.card.dueAt).getTime();
    }

    expect(strength(m)).toBe(1);
    expect(strength(review(s, m, "again", now))).toBeLessThan(1);
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
    const pick = pickReview(mem, now, FRESH);
    expect(pick?.type).toBe("sentence");

    if (pick?.type === "sentence") {
      expect(pick.covers.length).toBeGreaterThanOrEqual(4);
    }

    const c = compression(mem, now, {});
    expect(c.due).toBe(due);
    expect(c.tasks).toBeLessThan(due * 0.7);
  });

  test("a word with several sentences gets each of them in turn", async () => {
    const now = T0 + 40 * DAY;
    const taughtItems = await taught([0, 1, 2, 3, 4, 5, 6], T0);

    // Only "jeg" is due, and it is old enough to be reviewed inside a sentence.
    const mem = new Map(
      [...taughtItems].map(([id, m]) => [
        id,
        id === "w:jeg:pron"
          ? { ...m, card: { ...m.card, stability: 10 } }
          : { ...m, card: { ...m.card, dueAt: new Date(now + DAY) } },
      ])
    );

    const usable = sentencesWith("w:jeg:pron").filter((s) =>
      sentenceReady(s, mem)
    );

    expect(usable.length).toBeGreaterThan(5);

    const seen: Record<string, number> = {};
    const picked: string[] = [];

    // One review a day, for one day more than there are sentences.
    for (let day = 0; day <= usable.length; day += 1) {
      const pick = pickReview(mem, now, { seen, skipSentences: new Set() });

      if (pick?.type !== "sentence") {
        throw new Error("Expected a sentence");
      }

      picked.push(pick.sentence.id);
      seen[pick.sentence.id] = now + day * DAY;
    }

    // Every sentence is used once before any comes back, and the first to come back is the oldest.
    expect(new Set(picked.slice(0, -1)).size).toBe(usable.length);
    expect(picked.at(-1)).toBe(picked[0]);
  });
});

const scheduler = await createScheduler(0.9);

/** The memory with one item missed at the given time, inside a sentence. */
const withMiss = (mem: Map<string, Mem>, id: string, at: number): void => {
  const before = mem.get(id);

  if (before === undefined) {
    throw new Error(`"${id}" was not taught`);
  }

  mem.set(id, review(scheduler, before, "again", at, true));
};

/** What a review task reports: how many first tries were right and wrong. */
const answered = (right: number, wrong: number) => ({
  itemIds: [],
  right,
  taught: 0,
  wrong,
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

  test("new material waits while the learner keeps missing, and comes back once recalls succeed", async () => {
    const mem = await taught([0, 1, 2, 3], T0);
    const session = new Session(5, () => 0.3);
    const now = T0 + 40 * DAY;
    const first = session.next(view(mem), now);

    // Reviews have had their share of the session, but four answers of six were wrong.
    session.complete(first, answered(2, 4), 3.5 * 60_000);
    expect(["card", "sentence"]).toContain(session.next(view(mem), now).type);

    // Ten recalls that go well push the bad ones out of the count.
    for (let i = 0; i < 10; i += 1) {
      session.complete(first, answered(1, 0), 1000);
    }

    expect(["intro", "pattern"]).toContain(session.next(view(mem), now).type);
  });

  test("a pattern that was missed comes back inside a sentence, and in another one after that", async () => {
    const mem = await taught([0, 1, 2, 3], T0);
    const missedAt = T0 + 4 * DAY;
    const session = new Session(5, () => 0.3);

    // Nothing is due four days after the lessons, so the session would teach.
    expect(session.next(view(mem), missedAt).type).toBe("intro");

    withMiss(mem, "p:neg", missedAt);

    const dueAt = missedAt + 5 * 60_000;
    const first = session.next(view(mem), dueAt);
    const second = session.next(view(mem), dueAt);

    expect(first).toMatchObject({ covers: ["p:neg"], type: "sentence" });
    expect(second).toMatchObject({ covers: ["p:neg"], type: "sentence" });

    if (first.type === "sentence" && second.type === "sentence") {
      expect(second.sentence.id).not.toBe(first.sentence.id);
    }
  });

  test("a word that was missed comes back alone on its card, however well it was known", async () => {
    const mem = await taught([0, 1, 2, 3], T0);
    const missedAt = T0 + 4 * DAY;

    withMiss(mem, "w:ikke:adv", missedAt);

    const missed = mem.get("w:ikke:adv");

    if (missed === undefined) {
      throw new Error("The word is gone");
    }

    // Old enough for sentences by its stability, but it is being learned again.
    mem.set("w:ikke:adv", {
      ...missed,
      card: { ...missed.card, stability: 10 },
    });

    expect(
      new Session(5, () => 0.3).next(view(mem), missedAt + 5 * 60_000)
    ).toMatchObject({
      item: { id: "w:ikke:adv" },
      reason: "learning",
      type: "card",
    });
  });
});

/** The groups a lesson is taught in, for a learner who knows nothing else. */
const taughtBy = (index: number): string[][] => {
  const lesson = lessons[index];

  if (lesson === undefined) {
    throw new Error(`Unknown lesson ${index}`);
  }

  const mem = new Map<string, Mem>();
  const groups: string[][] = [];

  for (
    let group = nextNewItems(lesson, mem);
    group.length > 0;
    group = nextNewItems(lesson, mem)
  ) {
    groups.push(group.map((it) => it.text));

    for (const it of group) {
      mem.set(it.id, introduce(scheduler, it.id, T0));
    }
  }

  return groups;
};

describe("how much new material comes together", () => {
  test("a long phrase of new words is taught alone, short ones and words share a group", () => {
    expect(taughtBy(6)).toEqual([
      ["unnskyld", "tusen takk"],
      ["vær så god"],
      // The same phrase again, with its second use: "you are welcome".
      ["vær så god"],
      ["hyggelig å møte deg"],
      ["jeg vet ikke"],
      ["student", "lærer"],
    ]);
  });

  test("every item of every lesson is still taught, in order, three at most together", () => {
    for (const lesson of lessons) {
      const groups = taughtBy(lesson.index);

      expect(groups.flat()).toEqual(lesson.items.map((id) => item(id).text));
      expect(Math.max(...groups.map((group) => group.length))).toBeLessThan(4);
    }
  });
});
