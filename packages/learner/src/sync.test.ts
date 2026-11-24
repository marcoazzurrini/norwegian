import { describe, expect, test } from "bun:test";

import { LOG_PAGE } from "@norsk/protocol";

import {
  createWorld,
  DAY,
  dayOf,
  EMAIL,
  failure,
  logOf,
  MINUTE,
  must,
  shared,
  STOPPED,
  T0,
} from "./testing";
import type { Device } from "./testing";

const NO_CONNECTION =
  "No connection. Your progress is saved on this device and will sync later.";

/** Syncs the devices one after another, twice round, so each has seen what the others sent. */
const settle = async (devices: readonly Device[]): Promise<void> => {
  const round = async (remaining: readonly Device[]): Promise<void> => {
    const [first, ...rest] = remaining;

    if (first !== undefined) {
      await first.learner().syncNow();
      await first.idle();
      await round(rest);
    }
  };

  await round([...devices, ...devices]);
};

/** Two signed-in devices that both hold `w:hus`, taught on the phone. */
const pair = async () => {
  const world = createWorld();
  const phone = world.device("phone");
  const laptop = world.device("laptop");
  const learner = await phone.launch();

  await learner.teach(["w:hus"]);
  await learner.syncNow();
  await laptop.launch();

  return { laptop, phone, world };
};

/** Both devices learn and review offline, the laptop a day after the phone, and then sync in the given order. */
const studyApart = async (order: "phone first" | "laptop first") => {
  const { laptop, phone, world } = await pair();

  phone.online = false;
  laptop.online = false;

  world.clock.now += DAY;
  await phone.learner().teach(["w:bil"]);
  await phone.learner().applyReviews([{ grade: "again", id: "w:hus" }]);

  world.clock.now += DAY;
  await laptop.learner().teach(["w:katt"]);
  await laptop.learner().applyReviews([{ grade: "good", id: "w:hus" }]);

  const later = must(laptop.learner().memory().get("w:hus"));

  phone.online = true;
  laptop.online = true;
  await settle(order === "phone first" ? [phone, laptop] : [laptop, phone]);

  return { laptop, later, phone, world };
};

describe("two devices", () => {
  test("a second device gets what the first one learned", async () => {
    const { laptop, phone } = await pair();

    expect(await shared(laptop.learner())).toEqual(
      await shared(phone.learner())
    );

    expect(laptop.learner().memory().get("w:hus")).toEqual(
      must(phone.learner().memory().get("w:hus"))
    );
  });

  test.each(["phone first", "laptop first"] as const)(
    "after studying offline they end with the same data (%s)",
    async (order) => {
      const { laptop, later, phone, world } = await studyApart(order);
      const onPhone = await shared(phone.learner());

      expect(await shared(laptop.learner())).toEqual(onPhone);
      expect(onPhone.memory.map((mem) => mem.id)).toEqual([
        "w:bil",
        "w:hus",
        "w:katt",
      ]);

      // The later review of the same item wins on both.
      expect(phone.learner().memory().get("w:hus")).toEqual(later);
      expect(laptop.learner().memory().get("w:hus")).toEqual(later);

      // Every entry from both devices is kept, once: three items learned and two reviews.
      expect(onPhone.log).toHaveLength(5);
      expect(new Set(onPhone.log.map((entry) => entry.uid)).size).toBe(5);
      expect(world.server.log()).toHaveLength(5);
    }
  );

  test("syncing again changes nothing and stores nothing twice", async () => {
    const { laptop, phone, world } = await studyApart("phone first");
    const before = await shared(phone.learner());

    await settle([phone, laptop, phone]);

    expect(await shared(phone.learner())).toEqual(before);
    expect(await shared(laptop.learner())).toEqual(before);
    expect(world.server.log()).toHaveLength(5);
  });

  test("a review made while a sync is under way is not replaced by the older memory the server sends", async () => {
    const { laptop, phone, world } = await pair();

    world.clock.now += DAY;
    await laptop.learner().applyReviews([{ grade: "again", id: "w:hus" }]);
    await laptop.learner().syncNow();

    world.clock.now += DAY;

    const waiting = phone.whileWaiting;

    phone.whileWaiting = async () => {
      phone.whileWaiting = waiting;
      await phone.learner().applyReviews([{ grade: "good", id: "w:hus" }]);
    };

    await phone.learner().syncNow();

    const newest = must(phone.learner().memory().get("w:hus"));

    expect(newest.card.lastReviewAt).toEqual(new Date(world.clock.now));

    await settle([phone, laptop]);

    expect(laptop.learner().memory().get("w:hus")).toEqual(newest);
    expect(await shared(laptop.learner())).toEqual(
      await shared(phone.learner())
    );
    expect(world.server.log()).toHaveLength(3);
  });

  test("a device in step asks only for what is new, also after a restart", async () => {
    const { laptop, phone, world } = await studyApart("phone first");

    // What changed in the very millisecond of the last sync is sent again, to be safe; so let time pass.
    world.clock.now += MINUTE;
    await settle([phone, laptop]);
    world.clock.now += MINUTE;
    await phone.learner().syncNow();

    const cursors = {
      epoch: 0,
      logSeq: world.server.log().length,
      memRev: world.server.rev(),
    };

    expect(world.server.syncs().at(-1)).toMatchObject({
      ...cursors,
      log: [],
      memory: [],
    });

    world.clock.now += MINUTE;
    await phone.launch();

    expect(world.server.syncs().at(-1)).toMatchObject({
      ...cursors,
      log: [],
      memory: [],
    });
  });

  test("shared settings follow the device that changed them last; the others stay on their device", async () => {
    const { laptop, phone, world } = await pair();

    world.clock.now += MINUTE;
    await phone.learner().updateSettings({ minutes: 20, rate: 1.2 });
    await phone.learner().chooseLesson(3);

    world.clock.now += MINUTE;
    await laptop.learner().updateSettings({
      desiredRetention: 0.8,
      textScale: 1.3,
      voice: "Nora",
    });

    await settle([phone, laptop]);

    // The laptop changed a shared setting last, so its choices win, also those it had not touched itself.
    const expected = { desiredRetention: 0.8, minutes: 15 };

    expect(phone.learner().settings()).toMatchObject(expected);
    expect(laptop.learner().settings()).toMatchObject(expected);
    expect(phone.learner().progress().chosenLesson).toBeNull();
    expect(phone.learner().scheduler().desiredRetention).toBe(0.8);

    expect(phone.learner().settings()).toMatchObject({
      rate: 1.2,
      textScale: 1,
      voice: null,
    });

    expect(laptop.learner().settings()).toMatchObject({
      rate: 0.9,
      textScale: 1.3,
      voice: "Nora",
    });
  });

  test("a change to a setting of one device is no reason to take the other's choices", async () => {
    const { laptop, phone, world } = await pair();

    world.clock.now += MINUTE;
    await phone.learner().updateSettings({ minutes: 25 });
    world.clock.now += MINUTE;
    await laptop.learner().updateSettings({ rate: 1.4 });
    await settle([laptop, phone]);

    expect(phone.learner().settings().minutes).toBe(25);
    expect(laptop.learner().settings().minutes).toBe(25);
  });

  test("counters only grow", async () => {
    const { laptop, phone, world } = await pair();

    await phone.learner().addStudyTime(100_000);
    await phone.learner().markStoryDone("s:1");
    await phone.learner().recordSound("y-u", true);
    await phone.learner().markSentenceSeen("Jeg har et hus.", T0);

    world.clock.now += 3 * DAY;
    await laptop.learner().addStudyTime(250_000);
    await laptop.learner().markStoryDone("s:2");
    await laptop.learner().recordSound("y-u", false);
    await laptop.learner().recordSound("y-u", true);
    await laptop.learner().markSentenceSeen("Jeg har et hus.", T0 + DAY);

    await settle([phone, laptop]);

    const expected = {
      chosenLesson: null,
      days: [dayOf(T0), dayOf(T0 + 3 * DAY)],
      sentenceSeen: { "Jeg har et hus.": T0 + DAY },
      sounds: { "y-u": { right: 1, total: 2 } },
      storiesDone: ["s:1", "s:2"],
      totalMs: 250_000,
    };

    expect(phone.learner().progress()).toEqual(expected);
    expect(laptop.learner().progress()).toEqual(expected);
  });
});

describe("replacing the data everywhere", () => {
  test("Start over on one device clears the other", async () => {
    const { laptop, phone, world } = await pair();

    await laptop.learner().updateSettings({ rate: 1.3 });
    await laptop.learner().addStudyTime(MINUTE);
    await settle([laptop, phone]);

    world.clock.now += DAY;
    await phone.learner().startOver();

    expect(await shared(phone.learner())).toEqual({ log: [], memory: [] });
    expect(world.server.memory()).toEqual([]);
    expect(world.server.log()).toEqual([]);
    expect(world.server.epoch()).toBe(world.clock.now);

    await laptop.learner().syncNow();

    expect(await shared(laptop.learner())).toEqual({ log: [], memory: [] });
    expect(laptop.learner().progress().totalMs).toBe(0);

    // The laptop's own voice settings are not part of what is started over elsewhere.
    expect(laptop.learner().settings().rate).toBe(1.3);
  });

  test("both devices work on after a start over", async () => {
    const { laptop, phone, world } = await pair();

    world.clock.now += DAY;
    await phone.learner().startOver();
    await laptop.learner().syncNow();

    world.clock.now += DAY;
    await laptop.learner().teach(["w:katt"]);
    await settle([laptop, phone]);

    expect(await shared(phone.learner())).toEqual(
      await shared(laptop.learner())
    );
    expect([...phone.learner().memory().keys()]).toEqual(["w:katt"]);
  });

  test("what the other device learned before it heard of the start over is dropped", async () => {
    const { laptop, phone, world } = await pair();

    laptop.online = false;
    world.clock.now += DAY;
    await laptop.learner().teach(["w:katt"]);
    await phone.learner().startOver();

    laptop.online = true;
    await settle([laptop, phone]);

    expect(await shared(laptop.learner())).toEqual({ log: [], memory: [] });
    expect(world.server.memory()).toEqual([]);
  });

  test("Restore backup replaces the data on both devices", async () => {
    const { laptop, phone, world } = await pair();
    const backup = await phone.learner().exportBackup();
    const saved = await shared(phone.learner());

    world.clock.now += DAY;
    await laptop.learner().teach(["w:katt", "w:bil"]);
    await laptop.learner().applyReviews([{ grade: "again", id: "w:hus" }]);
    await settle([laptop, phone]);

    expect(phone.learner().memory().size).toBe(3);

    world.clock.now += DAY;
    await phone.learner().restoreBackup(backup);
    await laptop.learner().syncNow();

    expect(await shared(phone.learner())).toEqual(saved);
    expect(await shared(laptop.learner())).toEqual(saved);
    expect(world.server.log()).toEqual(saved.log);
  });

  test("when two devices start over, the later one wins and the earlier one takes its data", async () => {
    const { laptop, phone, world } = await pair();

    phone.online = false;
    world.clock.now += DAY;
    await phone.learner().startOver();
    await phone.learner().teach(["w:bil"]);

    world.clock.now += DAY;
    await laptop.learner().startOver();
    await laptop.learner().teach(["w:katt"]);
    await laptop.learner().syncNow();

    phone.online = true;
    await phone.learner().syncNow();

    // The server refused the phone's older start over (409), and the phone gave way.
    expect(world.server.resets()).toHaveLength(2);
    expect(world.server.epoch()).toBe(T0 + 2 * DAY);
    expect(phone.learner().syncStatus().error).toBeNull();
    expect([...phone.learner().memory().keys()]).toEqual(["w:katt"]);

    expect(await shared(phone.learner())).toEqual(
      await shared(laptop.learner())
    );
  });

  test("a start over that cannot be saved here is not carried out anywhere", async () => {
    const { phone, world } = await pair();
    const before = await shared(phone.learner());

    phone.stopAfter(0);

    expect(await failure(phone.learner().startOver())).toBe(STOPPED);
    expect(phone.learner().memory().has("w:hus")).toBe(true);

    phone.stopAfter(1000);
    await phone.learner().syncNow();

    expect(world.server.resets()).toEqual([]);
    expect(world.server.memory()).toHaveLength(1);
    expect(await shared(phone.learner())).toEqual(before);
  });

  test("a device that is signed out starts over only for itself", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    const learner = await phone.launch();

    await learner.teach(["w:hus"]);
    await learner.startOver();

    expect(learner.memory().size).toBe(0);
    expect(world.server.resets()).toEqual([]);

    const restarted = await phone.launch();

    expect(restarted.memory().size).toBe(0);
  });
});

describe("when to sync", () => {
  test("a burst of changes is sent in one message, a moment later", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();
    const before = world.server.syncs().length;

    await learner.teach(["w:hus"]);
    await learner.addStudyTime(MINUTE);
    // A new word waits five minutes; a pass that comes sooner is practice and is not recorded.
    world.clock.now += 5 * MINUTE;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);

    expect(world.server.syncs()).toHaveLength(before);
    expect(phone.runTimers()).toBe(1);

    await phone.idle();

    expect(world.server.syncs()).toHaveLength(before + 1);
    expect(world.server.log()).toHaveLength(2);
    expect(learner.syncStatus().lastOkAt).toBe(world.clock.now);
  });

  test("coming online or back to the page syncs", async () => {
    const { laptop, phone } = await pair();

    await phone.learner().teach(["w:bil"]);
    await phone.learner().syncNow();
    laptop.wake();
    await laptop.idle();

    expect(laptop.learner().memory().has("w:bil")).toBe(true);
  });

  test("starting the app syncs", async () => {
    const { laptop, phone } = await pair();

    await phone.learner().teach(["w:bil"]);
    await phone.learner().syncNow();

    const restarted = await laptop.launch();

    expect(restarted.memory().has("w:bil")).toBe(true);
  });

  test("calls made while a sync runs are folded into one follow-up", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();
    const before = world.server.syncs().length;

    await Promise.all([
      learner.syncNow(),
      learner.syncNow(),
      learner.syncNow(),
      learner.syncNow(),
    ]);
    await phone.idle();

    expect(world.server.syncs()).toHaveLength(before + 2);
  });

  test("a stopped learner no longer syncs", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();
    const before = world.server.syncs().length;

    await learner.teach(["w:hus"]);
    learner.stop();
    phone.wake();

    expect(phone.runTimers()).toBe(0);
    expect(world.server.syncs()).toHaveLength(before);
  });
});

describe("without a connection", () => {
  test("nothing is lost, and it is sent when the connection is back", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    phone.online = false;
    await learner.teach(["w:hus"]);
    phone.runTimers();
    await phone.idle();

    expect(learner.syncStatus()).toMatchObject({
      busy: false,
      error: NO_CONNECTION,
      linked: true,
    });
    expect(learner.memory().has("w:hus")).toBe(true);
    expect(world.server.memory()).toEqual([]);

    phone.online = true;
    phone.wake();
    await phone.idle();

    expect(learner.syncStatus().error).toBeNull();
    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
    expect(world.server.log()).toHaveLength(1);
  });

  test("a device that signed in before works at once on start", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const first = await phone.launch();

    await first.teach(["w:hus"]);
    await first.syncNow();

    phone.online = false;

    const second = await phone.launch();

    expect(second.ready()).toBe(true);

    expect(second.syncStatus()).toMatchObject({
      account: EMAIL,
      checked: true,
      lastOkAt: T0,
      linked: true,
    });

    world.clock.now += 5 * MINUTE;
    await second.applyReviews([{ grade: "good", id: "w:hus" }]);

    expect(await logOf(second)).toHaveLength(2);
  });

  test("a device that never signed in waits for the answer and then shows it is signed out", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.online = false;

    const learner = await phone.launch();

    expect(learner.syncStatus()).toMatchObject({
      account: null,
      checked: true,
      linked: false,
    });
    expect(world.server.syncs()).toEqual([]);
  });
});

describe("signing in and out", () => {
  test("when the server no longer knows the device, it is signed out and keeps its data", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.teach(["w:hus"]);

    // The session ended on the server; the device has not noticed yet.
    phone.account = null;
    await learner.syncNow();

    expect(learner.syncStatus()).toMatchObject({
      account: null,
      busy: false,
      error: "You are signed out. Sign in again to sync.",
      linked: false,
    });
    expect(learner.memory().has("w:hus")).toBe(true);

    const again = await phone.launch();

    expect(again.memory().has("w:hus")).toBe(true);
    expect(again.syncStatus().linked).toBe(false);
  });

  test("signing in again merges the device with the account", async () => {
    const { laptop, phone, world } = await pair();

    phone.account = null;
    await phone.learner().syncNow();
    await phone.learner().teach(["w:bil"]);
    await laptop.learner().teach(["w:katt"]);
    await laptop.learner().syncNow();

    await phone.learner().signIn();

    // Signing in reloads the page.
    const learner = await phone.launch();

    await laptop.learner().syncNow();

    expect(learner.syncStatus()).toMatchObject({
      account: EMAIL,
      linked: true,
    });
    expect([...learner.memory().keys()].toSorted()).toEqual([
      "w:bil",
      "w:hus",
      "w:katt",
    ]);
    expect(await shared(laptop.learner())).toEqual(await shared(learner));
    expect(world.server.memory()).toHaveLength(3);
  });

  test("signing out keeps the data here and on the server, and stops the sync", async () => {
    const { phone, world } = await pair();

    await phone.learner().signOut();

    const before = world.server.syncs().length;

    await phone.learner().teach(["w:bil"]);
    phone.runTimers();
    await phone.learner().syncNow();

    expect(phone.learner().syncStatus()).toMatchObject({
      account: null,
      error: null,
      lastOkAt: null,
      linked: false,
    });
    expect(phone.account).toBeNull();
    expect(phone.learner().memory().size).toBe(2);
    expect(world.server.memory()).toHaveLength(1);
    expect(world.server.syncs()).toHaveLength(before);
  });

  test("a sign-in that cannot start says so", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    const learner = await phone.launch();

    phone.online = false;
    await learner.signIn();

    expect(learner.syncStatus().error).toBe(
      "Sign-in could not start. Check your connection and try again."
    );
  });

  test("a device that was never signed in sends nothing", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    const learner = await phone.launch();

    await learner.teach(["w:hus"]);
    phone.runTimers();
    await learner.syncNow();

    expect(world.server.syncs()).toEqual([]);
    expect(learner.syncStatus()).toMatchObject({
      checked: true,
      linked: false,
    });
  });
});

describe("what is sent", () => {
  // The server keeps every field it is sent, so a field that belongs to one device must not travel.
  test("holds no field that this device adds to its own rows", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.teach(["w:hus"]);
    await learner.syncNow();
    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);
    await learner.syncNow();

    const sent = world.server.syncs();
    const mems = sent.flatMap((request) => request.memory);
    const entries = sent.flatMap((request) => request.log);

    expect(mems.length).toBeGreaterThan(0);
    expect(entries.length).toBeGreaterThan(0);

    for (const mem of mems) {
      expect(Object.keys(mem).toSorted()).toEqual([
        "card",
        "id",
        "introducedAt",
      ]);
    }

    for (const entry of entries) {
      expect(Object.keys(entry).toSorted()).toEqual([
        "at",
        "carrier",
        "grade",
        "id",
        "uid",
      ]);
    }
  });
});

/** The text of a backup file with `count` log entries for one item. */
const longBackup = (count: number): string =>
  JSON.stringify({
    log: Array.from({ length: count }, (_, index) => ({
      at: T0 - DAY + index,
      carrier: false,
      grade: index === 0 ? "new" : "good",
      id: "w:hus",
      uid: `old-${index}`,
    })),
    memory: [],
    meta: {},
    version: 1,
  });

describe("a long log", () => {
  test("travels in pages, up and down", async () => {
    const count = 2 * LOG_PAGE + 500;
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();
    const before = world.server.syncs().length;

    await learner.restoreBackup(longBackup(count));

    const sent = world.server.syncs().slice(before);

    expect(sent.map((request) => request.log.length)).toEqual([
      LOG_PAGE,
      LOG_PAGE,
      500,
    ]);
    expect(world.server.log()).toHaveLength(count);
    expect(learner.syncStatus().error).toBeNull();

    const laptop = world.device("laptop");
    const second = await laptop.launch();
    const fetched = world.server.syncs().slice(before + sent.length);

    expect(fetched).toHaveLength(3);
    expect(await logOf(second)).toHaveLength(count);
    expect(await shared(second)).toEqual(await shared(learner));
  });
});

describe("entries the device already has", () => {
  test("are not stored twice when a device signs in again and the server sends everything", async () => {
    const count = LOG_PAGE + 500;
    const world = createWorld();
    const phone = world.device("phone");
    const first = await phone.launch();

    await first.restoreBackup(longBackup(count));

    // One entry from before all the others: the device now sends its log in another order than the server holds it,
    // so the server's first page holds entries that the device did not send in its own first page.
    world.clock.now = T0 - 2 * DAY;
    await first.teach(["w:bil"]);
    await first.syncNow();
    await first.signOut();
    await first.signIn();

    const second = await phone.launch();
    const log = await logOf(second);

    expect(second.syncStatus()).toMatchObject({ error: null, linked: true });
    expect(log).toHaveLength(count + 1);
    expect(world.server.log()).toHaveLength(count + 1);
  });
});

describe("answers the app cannot read", () => {
  test("a record that does not parse is left out and counted; the rest is taken", async () => {
    const { laptop, phone, world } = await pair();

    await phone.learner().teach(["w:bil"]);
    await phone.learner().syncNow();

    world.server.spoil({
      log: [{ id: "w:rar", uid: "strange-1" }],
      memory: [{ id: "w:rar", introducedAt: T0 }, { id: "w:enda-en" }],
    });
    await laptop.learner().syncNow();

    expect(laptop.learner().syncStatus()).toMatchObject({
      error: null,
      skipped: 3,
    });
    expect([...laptop.learner().memory().keys()].toSorted()).toEqual([
      "w:bil",
      "w:hus",
    ]);
    expect(await shared(laptop.learner())).toEqual(
      await shared(phone.learner())
    );

    await laptop.learner().syncNow();

    expect(laptop.learner().syncStatus().skipped).toBe(0);
  });

  test("an answer that is not a sync answer is an error, and nothing is lost", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.teach(["w:hus"]);
    world.server.garble();
    await learner.syncNow();

    expect(learner.syncStatus()).toMatchObject({
      error: "The sync server sent an answer this app cannot read.",
      linked: true,
    });
    expect(learner.memory().has("w:hus")).toBe(true);

    await learner.syncNow();

    expect(learner.syncStatus().error).toBeNull();
    expect(world.server.log()).toHaveLength(1);

    const laptop = world.device("laptop");

    expect(await shared(await laptop.launch())).toEqual(await shared(learner));
  });
});
