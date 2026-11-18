import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { DEFAULT_SETTINGS } from "./index";
import {
  createWorld,
  DAY,
  failure,
  logOf,
  MINUTE,
  must,
  shared,
  snapshot,
  T0,
} from "./testing";

const NOT_A_BACKUP = "This file is not a Norsk backup";

/** A card as the scheduler makes it and as JSON writes it: dates are text. */
const card = {
  cardId: "w:hus",
  difficulty: 2.118,
  dueAt: "2026-11-12T08:00:00.000Z",
  lapses: 0,
  lastReviewAt: "2026-11-10T08:00:00.000Z",
  learningStep: 0,
  reps: 3,
  scheduleStatus: "review",
  scheduledDays: 2,
  stability: 2.3065,
  state: 2,
} as const;

/** A backup file exactly as the app wrote it before this module existed. */
const fromCurrentApp = JSON.stringify({
  exportedAt: 1_762_848_000_000,
  log: [
    {
      at: 1_762_588_800_000,
      carrier: false,
      grade: "new",
      id: "w:hus",
      uid: "5f0c2a52-7d0e-4d0c-9a53-0d1f4f6f2a11",
    },
    {
      at: 1_762_675_200_000,
      carrier: true,
      grade: "good",
      id: "w:hus",
      uid: "0b1de0f4-6a56-4f0a-8f0e-2c8f8a3c9d22",
    },
    {
      at: 1_762_761_600_000,
      carrier: false,
      grade: "again",
      id: "w:hus",
      uid: "c9a8e6b0-1f3a-4b62-bb3e-7e0a5d4c3b33",
    },
  ],
  memory: [{ card, id: "w:hus", introducedAt: 1_762_588_800_000 }],
  meta: {
    chosenLesson: 2,
    days: ["2026-11-08", "2026-11-09", "2026-11-10"],
    prefsAt: 1_762_600_000_000,
    sentenceSeen: { "Jeg har et hus.": 1_762_675_200_000 },
    settings: {
      desiredRetention: 0.85,
      minutes: 20,
      rate: 1,
      textScale: 1.1,
      voice: "Nora",
    },
    sounds: { "y-u": { right: 3, total: 4 } },
    storiesDone: ["s:1"],
    totalMs: 2_700_000,
  },
  version: 1,
});

/** A backup from the first version of the app: no ids on the log entries, fewer settings and counters. */
const fromFirstVersion = JSON.stringify({
  exportedAt: 1_750_000_000_000,
  log: [
    { at: 1_749_000_000_000, carrier: false, grade: "new", id: "w:hus" },
    { at: 1_749_100_000_000, carrier: false, grade: "good", id: "w:hus" },
  ],
  memory: [{ card, id: "w:hus", introducedAt: 1_749_000_000_000 }],
  meta: {
    days: ["2025-06-04"],
    settings: { desiredRetention: 0.9, minutes: 10, rate: 0.9, voice: null },
    storiesDone: [],
    totalMs: 600_000,
  },
  version: 1,
});

describe("a backup file", () => {
  test("holds everything, and restoring it brings everything back", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.teach(["w:hus", "w:bil"]);
    world.clock.now += DAY;
    await learner.applyReviews([{ carrier: true, grade: "good", id: "w:hus" }]);
    await learner.updateSettings({ desiredRetention: 0.8, voice: "Nora" });
    await learner.addStudyTime(5 * MINUTE);
    await learner.markStoryDone("s:1");
    await learner.recordSound("y-u", true);

    const backup = await learner.exportBackup();
    const saved = await snapshot(learner);
    const memory = new Map(learner.memory());

    world.clock.now += DAY;
    await learner.startOver();

    expect(learner.memory().size).toBe(0);
    expect(learner.settings()).toEqual(DEFAULT_SETTINGS);

    world.clock.now += DAY;
    await learner.restoreBackup(backup);

    // Restoring counts as the latest choice of settings, so that it wins on the other devices too.
    const expected = {
      ...saved,
      meta: { ...saved.meta, prefsAt: world.clock.now },
    };

    expect(await snapshot(learner)).toEqual(expected);
    expect(new Map(learner.memory())).toEqual(memory);
    expect(learner.scheduler().desiredRetention).toBe(0.8);

    const restarted = await phone.launch();

    expect(await snapshot(restarted)).toEqual(expected);
  });

  test("is written in the format the app has always used", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);

    const file = v.parse(
      v.record(v.string(), v.unknown()),
      JSON.parse(await learner.exportBackup())
    );

    expect(Object.keys(file).toSorted()).toEqual([
      "exportedAt",
      "log",
      "memory",
      "meta",
      "version",
    ]);

    expect(file).toMatchObject({
      exportedAt: T0,
      log: [
        { at: T0, carrier: false, grade: "new", id: "w:hus", uid: "phone-1" },
      ],
      memory: [
        {
          card: {
            cardId: "w:hus",
            dueAt: must(learner.memory().get("w:hus")).card.dueAt.toJSON(),
            lastReviewAt: new Date(T0).toJSON(),
          },
          id: "w:hus",
          introducedAt: T0,
        },
      ],
      meta: { prefsAt: 0, settings: DEFAULT_SETTINGS, totalMs: 0 },
      version: 1,
    });
  });

  test("written by the app before this module loads in full", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.restoreBackup(fromCurrentApp);

    const mem = must(learner.memory().get("w:hus"));

    expect(mem.card).toEqual({
      ...card,
      dueAt: new Date(card.dueAt),
      lastReviewAt: new Date(card.lastReviewAt),
    });

    expect(learner.settings()).toEqual({
      desiredRetention: 0.85,
      minutes: 20,
      rate: 1,
      textScale: 1.1,
      voice: "Nora",
    });

    expect(learner.progress()).toEqual({
      chosenLesson: 2,
      days: ["2026-11-08", "2026-11-09", "2026-11-10"],
      sentenceSeen: { "Jeg har et hus.": 1_762_675_200_000 },
      sounds: { "y-u": { right: 3, total: 4 } },
      storiesDone: ["s:1"],
      totalMs: 2_700_000,
    });

    const restored = await logOf(learner);

    expect(restored.map((entry) => entry.grade).toSorted()).toEqual([
      "again",
      "good",
      "new",
    ]);

    // The scheduler can work with the restored memory.
    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);

    await learner.syncNow();

    expect(must(learner.memory().get("w:hus")).card.reps).toBe(4);
    expect(await shared(await world.device("laptop").launch())).toEqual(
      await shared(learner)
    );
  });

  test("from the first version of the app loads, with ids given to its log entries", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.restoreBackup(fromFirstVersion);

    const log = await logOf(learner);

    expect(log.map((entry) => entry.uid)).toEqual(["phone-1", "phone-2"]);
    expect(learner.settings()).toEqual({ ...DEFAULT_SETTINGS, minutes: 10 });
    expect(learner.progress()).toMatchObject({
      chosenLesson: null,
      sounds: {},
      totalMs: 600_000,
    });
    expect(world.server.log()).toHaveLength(2);
  });

  const good = {
    log: [{ at: T0, carrier: false, grade: "new", id: "w:hus", uid: "u-1" }],
    memory: [{ card, id: "w:hus", introducedAt: T0 }],
    meta: {},
    version: 1,
  };

  const malformed = {
    "a card with a date that is not a date": {
      ...good,
      memory: [
        { card: { ...card, dueAt: "soon" }, id: "w:hus", introducedAt: T0 },
      ],
    },
    "a card without its stability": {
      ...good,
      memory: [
        {
          card: { ...card, stability: undefined },
          id: "w:hus",
          introducedAt: T0,
        },
      ],
    },
    "a log entry with an unknown grade": {
      ...good,
      log: [{ at: T0, carrier: false, grade: "easy", id: "w:hus", uid: "u-1" }],
    },
    "a setting of the wrong kind": {
      ...good,
      meta: { settings: { minutes: "many" } },
    },
    "another version": { ...good, version: 2 },
    "counters of the wrong kind": { ...good, meta: { totalMs: "a lot" } },
    "memories that are not a list": { ...good, memory: { "w:hus": card } },
    "no memories": { log: [], version: 1 },
    "something that is not a backup": [1, 2, 3],
    "the same log entry twice": { ...good, log: [...good.log, ...good.log] },
  };

  test.each(Object.keys(malformed))(
    "with %s is refused and changes nothing",
    async (name) => {
      const world = createWorld();
      const phone = world.device("phone");
      const learner = await phone.launch();

      await learner.teach(["w:bil"]);
      await learner.updateSettings({ minutes: 30 });
      await learner.syncNow();

      const before = await snapshot(learner);
      const file = JSON.stringify(new Map(Object.entries(malformed)).get(name));

      expect(await failure(learner.restoreBackup(file))).toBe(NOT_A_BACKUP);

      expect(await snapshot(learner)).toEqual(before);
      expect(learner.memory().has("w:bil")).toBe(true);
      expect(world.server.resets()).toEqual([]);
      expect(await snapshot(await phone.launch())).toEqual(before);
    }
  );

  test("that is not JSON is refused", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    expect(await failure(learner.restoreBackup("{ not json"))).toBe(
      NOT_A_BACKUP
    );
    expect(await failure(learner.restoreBackup(""))).toBe(NOT_A_BACKUP);
  });

  test("the good file used above is accepted, so each refusal is for its one fault", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.restoreBackup(JSON.stringify(good));

    expect([...learner.memory().keys()]).toEqual(["w:hus"]);
  });
});
