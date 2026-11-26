import { describe, expect, test } from "bun:test";

import { createLearner, DEFAULT_SETTINGS } from "./index";
import {
  createWorld,
  DAY,
  dayOf,
  failure,
  inOrder,
  logOf,
  MINUTE,
  must,
  snapshot,
  T0,
} from "./testing";

const NOT_LOADED = "The learner's data is not loaded yet";

const nothing = (): void => {
  // A host whose timers and events never fire.
};

describe("a new device", () => {
  test("is not ready until it has started, and then it is empty", async () => {
    const world = createWorld();
    const device = world.device("phone");

    device.account = null;

    const learner = await device.launch();

    expect(learner.ready()).toBe(true);
    expect(learner.memory().size).toBe(0);
    expect(learner.settings()).toEqual(DEFAULT_SETTINGS);

    expect(learner.progress()).toEqual({
      chosenLesson: null,
      days: [],
      pace: {},
      sentenceSeen: {},
      sounds: {},
      storiesDone: [],
      totalMs: 0,
    });
  });

  test("starting twice is the same as starting once", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);
    await learner.start();

    expect(learner.memory().size).toBe(1);
  });
});

describe("learning and reviewing", () => {
  test("teaching makes a memory and a log entry for each new item", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus", "w:bil"]);

    const { log, memory } = await snapshot(learner);

    expect(memory.map((mem) => mem.id)).toEqual(["w:bil", "w:hus"]);
    expect(must(learner.memory().get("w:hus")).introducedAt).toBe(T0);

    expect(log).toEqual([
      { at: T0, carrier: false, grade: "new", id: "w:hus", uid: "phone-1" },
      { at: T0, carrier: false, grade: "new", id: "w:bil", uid: "phone-2" },
    ]);
  });

  test("teaching an item that is already learned changes nothing", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);

    const before = await snapshot(learner);

    world.clock.now += DAY;
    await learner.teach(["w:hus"]);

    expect(await snapshot(learner)).toEqual(before);
  });

  test("a review updates the memory and is logged", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);

    const taught = must(learner.memory().get("w:hus"));

    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);

    const reviewed = must(learner.memory().get("w:hus"));

    expect(reviewed.card.reps).toBe(taught.card.reps + 1);
    expect(reviewed.card.lastReviewAt).toEqual(new Date(T0 + DAY));

    const log = await logOf(learner);

    expect(log.at(-1)).toEqual({
      at: T0 + DAY,
      carrier: false,
      grade: "good",
      id: "w:hus",
      uid: "phone-2",
    });
  });

  test("a review of an item that was never taught is ignored", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.applyReviews([{ grade: "good", id: "w:ukjent" }]);

    expect(await snapshot(learner)).toMatchObject({ log: [], memory: [] });
  });

  test("a second pass inside a sentence on the same day is not counted", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();
    const inSentence = { carrier: true, grade: "good", id: "w:hus" } as const;

    await learner.teach(["w:hus"]);

    // A few passes on later days take the item out of its learning steps.
    await inOrder(
      [1, 2, 6].map((days) => async () => {
        world.clock.now = T0 + days * DAY;
        await learner.applyReviews([{ grade: "good", id: "w:hus" }]);
      })
    );

    expect(must(learner.memory().get("w:hus")).card.scheduleStatus).toBe(
      "review"
    );

    world.clock.now += DAY;
    await learner.applyReviews([inSentence]);

    const counted = await snapshot(learner);

    world.clock.now += 5 * MINUTE;
    await learner.applyReviews([inSentence]);

    expect(await snapshot(learner)).toEqual(counted);
    expect(counted.log).toHaveLength(5);
    expect(counted.log.at(-1)).toMatchObject({ carrier: true });
  });
});

describe("settings and counters", () => {
  test("a setting changes only what was asked", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.updateSettings({ minutes: 25, voice: "Nora" });

    expect(learner.settings()).toEqual({
      ...DEFAULT_SETTINGS,
      minutes: 25,
      voice: "Nora",
    });
  });

  test("a new recall target rebuilds the scheduler", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    expect(learner.scheduler().desiredRetention).toBe(0.9);

    await learner.updateSettings({ desiredRetention: 0.8 });

    expect(learner.scheduler().desiredRetention).toBe(0.8);
  });

  test("study time adds up and each day is counted once", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.addStudyTime(60_000);
    await learner.addStudyTime(30_000);
    world.clock.now += 2 * DAY;
    await learner.addStudyTime(10_000);

    expect(learner.progress().totalMs).toBe(100_000);
    expect(learner.progress().days).toEqual([dayOf(T0), dayOf(T0 + 2 * DAY)]);
  });

  test("stories, sentences, sounds and the chosen lesson are kept", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.markStoryDone("s:1");
    await learner.markStoryDone("s:1");
    await learner.markSentenceSeen("Jeg har et hus.");
    await learner.markSentenceSeen("Hun bor her.", T0 - DAY);
    await learner.recordSound("y-u", true);
    await learner.recordSound("y-u", false);
    await learner.chooseLesson(4);

    expect(learner.progress()).toEqual({
      chosenLesson: 4,
      days: [],
      pace: {},
      sentenceSeen: { "Hun bor her.": T0 - DAY, "Jeg har et hus.": T0 },
      sounds: { "y-u": { right: 1, total: 2 } },
      storiesDone: ["s:1"],
      totalMs: 0,
    });

    await learner.chooseLesson(null);

    expect(learner.progress().chosenLesson).toBeNull();
  });

  test("how long the latest tasks took is kept, also after a restart", async () => {
    const world = createWorld();
    const device = world.device("phone");
    const learner = await device.launch();
    const pace = { card: [7000, 9000], sentence: [21_000] };

    await learner.savePace(pace);

    expect(learner.progress().pace).toEqual(pace);

    const restarted = await device.launch();

    expect(restarted.progress().pace).toEqual(pace);
  });
});

describe("restarting the app", () => {
  test("everything is still there", async () => {
    const world = createWorld();
    const device = world.device("phone");
    const first = await device.launch();

    await first.teach(["w:hus", "w:bil"]);
    world.clock.now += DAY;
    await first.applyReviews([{ grade: "again", id: "w:hus" }]);
    await first.updateSettings({ desiredRetention: 0.85, rate: 1.1 });
    await first.addStudyTime(90_000);
    await first.markStoryDone("s:1");
    await first.recordSound("y-u", true);
    await first.chooseLesson(2);

    const before = await snapshot(first);
    const memory = new Map(first.memory());
    const second = await device.launch();

    expect(await snapshot(second)).toEqual(before);
    expect(new Map(second.memory())).toEqual(memory);
    expect(second.settings()).toEqual(first.settings());
    expect(second.progress()).toEqual(first.progress());
    expect(second.scheduler().desiredRetention).toBe(0.85);
  });
});

describe("before the data is loaded", () => {
  test("commands are refused instead of writing over what is saved", async () => {
    const world = createWorld();
    const device = world.device("phone");
    const first = await device.launch();

    await first.updateSettings({ minutes: 30 });
    first.stop();

    const cold = createLearner({
      account: {
        currentUser: async () => await Promise.resolve(null),
        signIn: async () => {
          await Promise.resolve();
        },
        signOut: async () => {
          await Promise.resolve();
        },
      },
      course: "no",
      fetch: async () => await Promise.resolve(Response.json({})),
      host: { after: () => nothing, onWake: () => nothing },
      indexedDB: device.indexedDB,
      newId: () => "x",
      now: () => T0,
    });

    expect(cold.ready()).toBe(false);
    expect(() => cold.scheduler()).toThrow();
    expect(await failure(cold.teach(["w:hus"]))).toBe(NOT_LOADED);
    expect(await failure(cold.addStudyTime(1))).toBe(NOT_LOADED);
    expect(await failure(cold.exportBackup())).toBe(NOT_LOADED);

    const second = await device.launch();

    expect(second.settings().minutes).toBe(30);
  });
});

describe("reading one part at a time", () => {
  test("a review changes the memory and leaves the settings and counters as they were", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);

    const memory = learner.memory();
    const settings = learner.settings();
    const progress = learner.progress();
    let calls = 0;

    const stop = learner.subscribe(() => {
      calls += 1;
    });

    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);

    expect(calls).toBeGreaterThan(0);
    expect(learner.memory()).not.toBe(memory);
    expect(learner.settings()).toBe(settings);
    expect(learner.progress()).toBe(progress);

    stop();
    calls = 0;
    await learner.addStudyTime(1000);

    expect(calls).toBe(0);
  });

  test("a setting changes the settings and leaves the memory and counters as they were", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);

    const memory = learner.memory();
    const settings = learner.settings();
    const progress = learner.progress();

    await learner.updateSettings({ textScale: 1.2 });

    expect(learner.settings()).not.toBe(settings);
    expect(learner.memory()).toBe(memory);
    expect(learner.progress()).toBe(progress);

    await learner.addStudyTime(1000);

    expect(learner.settings().textScale).toBe(1.2);
    expect(learner.progress()).not.toBe(progress);
  });
});
