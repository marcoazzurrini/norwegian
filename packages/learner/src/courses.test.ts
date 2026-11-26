import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { createLearner, DEFAULT_SETTINGS } from "./index";
import {
  createWorld,
  DAY,
  failure,
  logOf,
  MINUTE,
  seedOldLayout,
  shared,
  snapshot,
  T0,
} from "./testing";

const OTHER_COURSE =
  "This backup is from another course. Open that course and restore it there.";

const NOT_A_BACKUP = "This file is not a Norsk backup";

/** The names of the databases on a device. */
const databases = async (factory: IDBFactory): Promise<string[]> => {
  const all = await factory.databases();

  return all.map((database) => database.name ?? "").toSorted();
};

describe("two courses on one device", () => {
  test("each has its own memories, log, settings and counters", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const norwegian = await phone.launch();

    await norwegian.teach(["w:hus", "w:bil"]);
    await norwegian.updateSettings({ minutes: 30 });
    await norwegian.addStudyTime(5 * MINUTE);
    await norwegian.markStoryDone("s:1");
    await norwegian.syncNow();

    const before = await snapshot(norwegian);
    const german = await phone.launch({ course: "de" });

    // The German course starts empty, though the learner is signed in and the server holds Norwegian data.
    expect(german.memory().size).toBe(0);
    expect(german.settings()).toEqual(DEFAULT_SETTINGS);
    expect(german.progress()).toMatchObject({ storiesDone: [], totalMs: 0 });
    expect(await logOf(german)).toEqual([]);

    // The same item id is another word in another course.
    await german.teach(["w:hus", "w:haus"]);
    world.clock.now += DAY;
    await german.applyReviews([{ grade: "good", id: "w:hus" }]);
    await german.updateSettings({ minutes: 10 });
    await german.syncNow();

    const back = await phone.launch();

    expect(await snapshot(back)).toEqual(before);
    expect(back.settings().minutes).toBe(30);
    expect([...back.memory().keys()].toSorted()).toEqual(["w:bil", "w:hus"]);
    expect(back.memory().get("w:hus")?.card.reps).toBe(1);

    const again = await phone.launch({ course: "de" });

    expect([...again.memory().keys()].toSorted()).toEqual(["w:haus", "w:hus"]);
    expect(again.memory().get("w:hus")?.card.reps).toBe(2);
    expect(again.settings().minutes).toBe(10);
  });

  test("the server keeps them apart, and every message names its course", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const norwegian = await phone.launch();

    await norwegian.teach(["w:hus"]);
    await norwegian.syncNow();

    const german = await phone.launch({ course: "de" });

    await german.teach(["w:haus"]);
    await german.updateSettings({ minutes: 10 });
    await german.syncNow();

    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
    expect(world.server.memory("de").map((mem) => mem.id)).toEqual(["w:haus"]);
    expect(world.server.log().map((entry) => entry.id)).toEqual(["w:hus"]);
    expect(world.server.log("de").map((entry) => entry.id)).toEqual(["w:haus"]);
    expect(world.server.meta()?.settings.minutes).toBe(15);
    expect(world.server.meta("de")?.settings.minutes).toBe(10);

    const courses = world.server.syncs().map((request) => request.course);

    expect(new Set(courses)).toEqual(new Set(["no", "de"]));
    expect(courses.indexOf("de")).toBe(courses.lastIndexOf("no") + 1);
  });

  test("another device receives each course in that course only", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const laptop = world.device("laptop");

    await phone.launch();
    await phone.learner().teach(["w:hus"]);
    await phone.learner().syncNow();
    await phone.launch({ course: "de" });
    await phone.learner().teach(["w:haus"]);
    await phone.learner().syncNow();

    const german = await laptop.launch({ course: "de" });

    expect([...german.memory().keys()]).toEqual(["w:haus"]);
    expect(await shared(german)).toEqual(await shared(phone.learner()));

    const norwegian = await laptop.launch();

    expect([...norwegian.memory().keys()]).toEqual(["w:hus"]);
  });

  test("Start over in one course leaves the other alone, here, on the server and on other devices", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const laptop = world.device("laptop");
    const norwegian = await phone.launch();

    await norwegian.teach(["w:hus"]);
    await norwegian.updateSettings({ minutes: 30 });
    await norwegian.syncNow();

    const before = await snapshot(norwegian);
    const german = await phone.launch({ course: "de" });

    await german.teach(["w:haus"]);
    await german.syncNow();
    await laptop.launch({ course: "de" });
    await laptop.launch();

    world.clock.now += DAY;
    await phone.launch({ course: "de" });
    await phone.learner().startOver();

    expect(world.server.resets()).toEqual([{ course: "de", epoch: T0 + DAY }]);
    expect(world.server.epoch("de")).toBe(T0 + DAY);
    expect(world.server.memory("de")).toEqual([]);
    expect(world.server.epoch()).toBe(0);
    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
    expect(world.server.meta()?.settings.minutes).toBe(30);

    // The phone's Norwegian data is as it was.
    expect(await snapshot(await phone.launch())).toEqual(before);

    // The laptop keeps Norwegian and drops German.
    const laptopNorwegian = await laptop.launch();

    expect([...laptopNorwegian.memory().keys()]).toEqual(["w:hus"]);
    expect(laptopNorwegian.settings().minutes).toBe(30);

    const laptopGerman = await laptop.launch({ course: "de" });

    expect(laptopGerman.memory().size).toBe(0);
  });

  test("Start over in the first course leaves another course alone", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const german = await phone.launch({ course: "de" });

    await german.teach(["w:haus"]);
    await german.syncNow();

    const before = await snapshot(german);
    const norwegian = await phone.launch();

    await norwegian.teach(["w:hus"]);
    world.clock.now += DAY;
    await norwegian.startOver();

    expect(world.server.resets()).toEqual([{ course: "no", epoch: T0 + DAY }]);
    expect(world.server.memory("de").map((mem) => mem.id)).toEqual(["w:haus"]);
    expect(await snapshot(await phone.launch({ course: "de" }))).toEqual(
      before
    );
  });
});

describe("where a course is kept on the device", () => {
  test("the first course uses the database the app has always used", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    await phone.launch();

    expect(await databases(phone.indexedDB)).toEqual(["norsk"]);
  });

  test("another course gets a database of its own", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    await phone.launch({ course: "de" });

    expect(await databases(phone.indexedDB)).toEqual(["norsk-de"]);
  });

  test("data from before there were courses is the first course's, and no other's", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    await seedOldLayout(phone.indexedDB, {
      log: [
        { at: T0, carrier: false, grade: "new", id: "w:hus", uid: "old-1" },
      ],
      memory: [
        {
          card: {
            cardId: "w:hus",
            difficulty: 5,
            dueAt: new Date(T0 + DAY),
            lapses: 0,
            lastReviewAt: new Date(T0),
            learningStep: 0,
            reps: 1,
            scheduleStatus: "review",
            scheduledDays: 1,
            stability: 2.5,
            state: 2,
          },
          id: "w:hus",
          introducedAt: T0,
        },
      ],
      meta: { totalMs: 600_000 },
      version: 2,
    });

    const german = await phone.launch({ course: "de" });

    expect(german.memory().size).toBe(0);

    const norwegian = await phone.launch();

    expect([...norwegian.memory().keys()]).toEqual(["w:hus"]);
    expect(norwegian.progress().totalMs).toBe(600_000);
  });

  test("a name that is not a course's is refused at once", () => {
    const world = createWorld();
    const phone = world.device("phone");

    for (const course of ["", "NO", "no/de", "../norsk"]) {
      expect(() =>
        createLearner({
          account: {
            currentUser: async () => await Promise.resolve(null),
            signIn: async () => {
              await Promise.resolve();
            },
            signOut: async () => {
              await Promise.resolve();
            },
          },
          course,
          fetch: async () => await Promise.resolve(Response.json({})),
          indexedDB: phone.indexedDB,
          newId: () => "x",
          now: () => T0,
        })
      ).toThrow();
    }
  });
});

/** The fields of a backup file. */
const fieldsOf = (file: string) =>
  v.parse(v.record(v.string(), v.unknown()), JSON.parse(file));

/** A device with one learned word in each of two courses, and the backup file of each. */
const twoCourses = async () => {
  const world = createWorld();
  const phone = world.device("phone");
  const norwegian = await phone.launch();

  await norwegian.teach(["w:hus"]);
  await norwegian.syncNow();

  const norwegianFile = await norwegian.exportBackup();
  const german = await phone.launch({ course: "de" });

  await german.teach(["w:haus"]);
  await german.syncNow();

  const germanFile = await german.exportBackup();

  return { germanFile, norwegianFile, phone, world };
};

describe("a backup file and its course", () => {
  test("names the course it was made in", async () => {
    const { germanFile, norwegianFile } = await twoCourses();

    expect(fieldsOf(norwegianFile)).toMatchObject({ course: "no" });
    expect(fieldsOf(germanFile)).toMatchObject({ course: "de" });
  });

  test("is restored in the course it was made in", async () => {
    const { germanFile, phone, world } = await twoCourses();
    const german = await phone.launch({ course: "de" });

    world.clock.now += DAY;
    await german.startOver();
    world.clock.now += DAY;
    await german.restoreBackup(germanFile);

    expect([...german.memory().keys()]).toEqual(["w:haus"]);
    expect(world.server.memory("de").map((mem) => mem.id)).toEqual(["w:haus"]);
    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
  });

  test("of another course is refused and changes nothing, here or on the server", async () => {
    const { germanFile, norwegianFile, phone, world } = await twoCourses();
    const german = await phone.launch({ course: "de" });
    const germanBefore = await snapshot(german);

    expect(await failure(german.restoreBackup(norwegianFile))).toBe(
      OTHER_COURSE
    );
    expect(await snapshot(german)).toEqual(germanBefore);

    const norwegian = await phone.launch();
    const norwegianBefore = await snapshot(norwegian);

    expect(await failure(norwegian.restoreBackup(germanFile))).toBe(
      OTHER_COURSE
    );
    expect(await snapshot(norwegian)).toEqual(norwegianBefore);
    expect([...norwegian.memory().keys()]).toEqual(["w:hus"]);

    expect(world.server.resets()).toEqual([]);
    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
    expect(world.server.memory("de").map((mem) => mem.id)).toEqual(["w:haus"]);
  });

  test("without a course is from before there were courses: it is restored in the first course only", async () => {
    const { norwegianFile, phone } = await twoCourses();
    const { course: _course, ...fields } = fieldsOf(norwegianFile);
    const old = JSON.stringify(fields);
    const german = await phone.launch({ course: "de" });

    expect(await failure(german.restoreBackup(old))).toBe(OTHER_COURSE);

    const norwegian = await phone.launch();

    await norwegian.startOver();
    await norwegian.restoreBackup(old);

    expect([...norwegian.memory().keys()]).toEqual(["w:hus"]);
  });

  test("with something that is not a course's name is not a backup", async () => {
    const { norwegianFile, phone } = await twoCourses();
    const learner = await phone.launch();

    for (const course of [5, null, "NO", ""]) {
      const file = JSON.stringify({ ...fieldsOf(norwegianFile), course });

      // oxlint-disable-next-line no-await-in-loop -- One restore at a time, as a learner would try them.
      expect(await failure(learner.restoreBackup(file))).toBe(NOT_A_BACKUP);
    }
  });
});
