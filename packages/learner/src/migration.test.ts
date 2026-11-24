// Devices in use hold data written by the app as it was before this module. These tests build
// that data in its exact layout and start the learner on it.
import { describe, expect, test } from "bun:test";

import { createScheduler, introduce, review } from "@norsk/engine";
import type { Mem } from "@norsk/engine";
import type { WireLog } from "@norsk/protocol";

import {
  createWorld,
  DAY,
  EMAIL,
  failure,
  inspectLog,
  logOf,
  seedOldLayout,
  snapshot,
  T0,
} from "./testing";
import type { Device } from "./testing";

const START = T0 - 10 * DAY;

const withoutUid = ({ uid: _uid, ...row }: WireLog): Omit<WireLog, "uid"> =>
  row;

/** What the app as it was would have on a device after ten days of use. */
const oldData = async () => {
  const scheduler = await createScheduler(0.85);
  const hus = introduce(scheduler, "w:hus", START);
  const bil = introduce(scheduler, "w:bil", START);
  const katt = introduce(scheduler, "w:katt", T0 - DAY);
  const husLater = review(scheduler, hus, "good", START + DAY);
  const bilLater = review(scheduler, bil, "again", T0 - 2 * DAY);

  const log: WireLog[] = [
    {
      at: START,
      carrier: false,
      grade: "new",
      id: "w:hus",
      uid: "1a6f0d0e-0000-4000-8000-000000000001",
    },
    {
      at: START,
      carrier: false,
      grade: "new",
      id: "w:bil",
      uid: "1a6f0d0e-0000-4000-8000-000000000002",
    },
    {
      at: START + DAY,
      carrier: false,
      grade: "good",
      id: "w:hus",
      uid: "1a6f0d0e-0000-4000-8000-000000000003",
    },
    {
      at: T0 - 2 * DAY,
      carrier: true,
      grade: "again",
      id: "w:bil",
      uid: "1a6f0d0e-0000-4000-8000-000000000004",
    },
    {
      at: T0 - DAY,
      carrier: false,
      grade: "new",
      id: "w:katt",
      uid: "1a6f0d0e-0000-4000-8000-000000000005",
    },
  ];

  return {
    log,
    memory: [husLater, bilLater, katt],
    meta: {
      chosenLesson: 4,
      days: ["2026-11-08", "2026-11-09", "2026-11-17"],
      prefsAt: START + 5,
      sentenceSeen: { "Jeg har et hus.": START + DAY },
      settings: {
        desiredRetention: 0.85,
        minutes: 20,
        rate: 1.1,
        textScale: 1.2,
        voice: "Nora",
      },
      sounds: { "y-u": { right: 7, total: 9 } },
      storiesDone: ["s:1", "s:2"],
      totalMs: 5_400_000,
    },
    // `key` is from the time before sign-in, when devices shared a secret instead.
    sync: {
      account: EMAIL,
      epoch: 3,
      key: "an-old-shared-secret",
      lastOkAt: T0 - 3 * DAY,
      logSeq: 12,
      memRev: 7,
      pendingReset: null,
      pushedAt: T0 - 3 * DAY,
    },
  };
};

type Old = Awaited<ReturnType<typeof oldData>>;

/** Version 2 is the layout the app used until this module. */
const seedVersion2 = async (device: Device, old: Old): Promise<void> => {
  await seedOldLayout(device.indexedDB, { ...old, version: 2 });
};

/** Version 1 had no ids on its log rows and knew nothing of accounts. */
const seedVersion1 = async (device: Device, old: Old): Promise<void> => {
  await seedOldLayout(device.indexedDB, {
    ...old,
    log: old.log.map(withoutUid),
    sync: { key: "an-old-shared-secret" },
    version: 1,
  });
};

const byId = (memory: readonly Mem[]): Map<string, Mem> =>
  new Map(memory.map((mem) => [mem.id, mem]));

describe("data written by the app before this module (version 2)", () => {
  test("is all there after the upgrade", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedVersion2(phone, old);
    phone.online = false;

    const learner = await phone.launch();

    expect(new Map(learner.memory())).toEqual(byId(old.memory));

    expect(learner.settings()).toEqual({
      desiredRetention: 0.85,
      minutes: 20,
      rate: 1.1,
      textScale: 1.2,
      voice: "Nora",
    });

    expect(learner.progress()).toEqual({
      chosenLesson: 4,
      days: ["2026-11-08", "2026-11-09", "2026-11-17"],
      pace: {},
      sentenceSeen: { "Jeg har et hus.": START + DAY },
      sounds: { "y-u": { right: 7, total: 9 } },
      storiesDone: ["s:1", "s:2"],
      totalMs: 5_400_000,
    });

    expect(learner.scheduler().desiredRetention).toBe(0.85);

    const saved = await snapshot(learner);

    expect(saved.log).toEqual(old.log);
    expect(saved.meta.prefsAt).toBe(START + 5);

    // The device was signed in, so it is usable at once, without a connection.
    expect(learner.syncStatus()).toMatchObject({
      account: EMAIL,
      checked: true,
      lastOkAt: T0 - 3 * DAY,
      linked: true,
    });
  });

  test("keeps its place in the sync: only what changed since the last sync is sent", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    await seedVersion2(phone, await oldData());
    await phone.launch();

    const [first] = world.server.syncs();

    expect(first).toMatchObject({ epoch: 3, logSeq: 12, memRev: 7 });
    expect(first?.memory.map((mem) => mem.id).toSorted()).toEqual([
      "w:bil",
      "w:katt",
    ]);
    expect(first?.log.map((entry) => entry.id)).toEqual(["w:bil", "w:katt"]);
    expect(phone.learner().syncStatus().error).toBeNull();
  });

  test("is left in its layout, so nothing is copied and nothing can be lost on the way", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedVersion2(phone, old);
    phone.online = false;
    const learner = await phone.launch();

    learner.stop();

    expect(await inspectLog(phone.indexedDB)).toEqual({
      uids: old.log.map((row) => row.uid),
      version: 2,
    });
    expect(phone.writes()).toBe(0);
  });

  test("goes on working: old and new reviews live side by side", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedVersion2(phone, old);
    phone.online = false;

    const first = await phone.launch();

    await first.applyReviews([{ grade: "good", id: "w:katt" }]);
    await first.teach(["w:hund"]);

    const second = await phone.launch();

    expect(second.memory().size).toBe(4);
    expect(new Map(second.memory())).toEqual(new Map(first.memory()));
    expect(await logOf(second)).toHaveLength(7);
  });

  test("with dates saved as text, as an old restore could leave them, loads with real dates", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedOldLayout(phone.indexedDB, {
      ...old,
      // A date as JSON writes it, which is how a backup file holds a memory.
      memory: old.memory.map((mem) => ({
        ...mem,
        card: {
          ...mem.card,
          dueAt: mem.card.dueAt.toJSON(),
          lastReviewAt: mem.card.lastReviewAt?.toJSON() ?? null,
        },
      })),
      version: 2,
    });
    phone.online = false;

    const learner = await phone.launch();

    expect(new Map(learner.memory())).toEqual(byId(old.memory));
  });

  test("with one row nobody can read, the rest loads and the row stays where it is", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedOldLayout(phone.indexedDB, {
      ...old,
      memory: [
        ...old.memory,
        { card: { stability: "high" }, id: "w:rar", introducedAt: T0 },
      ],
      meta: { ...old.meta, totalMs: "a lot" },
      version: 2,
    });
    phone.online = false;

    const learner = await phone.launch();

    expect([...learner.memory().keys()].toSorted()).toEqual([
      "w:bil",
      "w:hus",
      "w:katt",
    ]);
    expect(learner.progress()).toMatchObject({ chosenLesson: 4, totalMs: 0 });
    expect(learner.settings().minutes).toBe(20);
  });
});

describe("data of the first layout (version 1)", () => {
  test("is upgraded in place: every log entry gets an id and nothing else changes", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();

    await seedVersion1(phone, old);
    phone.account = null;

    const learner = await phone.launch();
    const saved = await snapshot(learner);

    expect(new Map(learner.memory())).toEqual(byId(old.memory));
    expect(saved.log.map(withoutUid)).toEqual(old.log.map(withoutUid));
    expect(saved.log.map((entry) => entry.uid)).toEqual([
      "phone-1",
      "phone-2",
      "phone-3",
      "phone-4",
      "phone-5",
    ]);
    expect(learner.progress().totalMs).toBe(5_400_000);
    expect(learner.syncStatus()).toMatchObject({
      account: null,
      linked: false,
    });

    const upgraded = await inspectLog(phone.indexedDB);

    expect(upgraded.version).toBe(2);
  });

  test("can then sign in and send everything", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    await seedVersion1(phone, await oldData());
    await phone.launch();

    expect(world.server.log()).toHaveLength(5);
    expect(world.server.memory()).toHaveLength(3);
    expect(phone.learner().syncStatus().error).toBeNull();
  });

  test("an upgrade that is interrupted leaves the old data whole, and runs again on the next start", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const old = await oldData();
    const { newId } = phone;
    let made = 0;

    await seedVersion1(phone, old);
    phone.account = null;

    phone.newId = () => {
      made += 1;

      if (made === 3) {
        throw new Error("The app was stopped");
      }

      return newId();
    };

    expect(await failure(phone.launch())).toContain("aborted");

    expect(await inspectLog(phone.indexedDB)).toEqual({
      uids: [undefined, undefined, undefined, undefined, undefined],
      version: 1,
    });

    phone.newId = newId;

    const learner = await phone.launch();
    const saved = await snapshot(learner);

    expect(saved.log.map(withoutUid)).toEqual(old.log.map(withoutUid));
    expect(new Set(saved.log.map((entry) => entry.uid)).size).toBe(5);
    expect(new Map(learner.memory())).toEqual(byId(old.memory));
  });
});
