// The app can be closed at any moment. These tests stop it after every single write and check
// that, after a restart, no review is lost and none is counted twice.
import { describe, expect, test } from "bun:test";

import type { Learner } from "./index";
import {
  createWorld,
  DAY,
  EMAIL,
  failure,
  logOf,
  MINUTE,
  must,
  shared,
  snapshot,
  STOPPED,
} from "./testing";
import type { Snapshot, World } from "./testing";

type Step = () => Promise<void>;

/** A stretch of ordinary use. Each step is one command. */
const steps = (world: World, learner: Learner): Step[] => [
  async () => {
    await learner.teach(["w:hus", "w:bil"]);
  },
  async () => {
    world.clock.now += DAY;
    await learner.applyReviews([
      { grade: "good", id: "w:hus" },
      { grade: "again", id: "w:bil" },
    ]);
  },
  async () => {
    await learner.addStudyTime(MINUTE);
  },
  async () => {
    // Same moment as the review before it: the clock is no help in telling the two apart.
    await learner.applyReviews([{ grade: "good", id: "w:bil" }]);
  },
  async () => {
    await learner.updateSettings({ minutes: 20 });
  },
  async () => {
    await learner.teach(["w:katt"]);
  },
  async () => {
    await learner.applyReviews([
      { grade: "again", id: "w:katt" },
      { grade: "good", id: "w:katt" },
    ]);
  },
  async () => {
    await learner.markStoryDone("s:1");
  },
];

/** Runs the steps until one fails because the app was stopped. Returns how many finished. */
const runUntilStopped = async (
  remaining: readonly Step[],
  done = 0
): Promise<number> => {
  const [first, ...rest] = remaining;

  if (first === undefined) {
    return done;
  }

  try {
    await first();
  } catch {
    return done;
  }

  return await runUntilStopped(rest, done + 1);
};

/** A device that is signed out, so the only writes are those of the commands. */
const offlineDevice = (world: World) => {
  const device = world.device("phone");

  device.account = null;

  return device;
};

/** The state after each step when nothing goes wrong, starting with the empty state. */
const uninterrupted = async (): Promise<{
  states: Snapshot[];
  writes: number;
}> => {
  const world = createWorld();
  const device = offlineDevice(world);
  const learner = await device.launch();
  const states = [await snapshot(learner)];

  const record = async (remaining: readonly Step[]): Promise<void> => {
    const [first, ...rest] = remaining;

    if (first !== undefined) {
      await first();
      states.push(await snapshot(learner));
      await record(rest);
    }
  };

  await record(steps(world, learner));

  return { states, writes: device.writes() };
};

describe("stopping the app between writes", () => {
  test("after any write, a restart finds every command either whole or not at all", async () => {
    const { states, writes } = await uninterrupted();

    // Eight commands; the five that teach or review write twice (the log entry, then the memory).
    expect(writes).toBe(13);

    await Promise.all(
      Array.from({ length: writes + 1 }, async (_, allowed) => {
        const world = createWorld();
        const device = offlineDevice(world);
        const first = await device.launch({ writes: allowed });
        const finished = await runUntilStopped(steps(world, first));
        const second = await device.launch();
        const found = await snapshot(second);

        // Nothing that finished is lost; the command that was cut off counts whole if its log entry was saved.
        expect([states[finished], states[finished + 1]]).toContainEqual(found);

        // Restarting once more changes nothing: what was finished on the first restart was saved.
        const third = await device.launch();

        expect(await snapshot(third)).toEqual(found);
      })
    );
  });

  test("a review whose log entry was saved but whose memory was not is finished on restart, once", async () => {
    const world = createWorld();
    const device = offlineDevice(world);
    const first = await device.launch();

    await first.teach(["w:hus"]);

    const taught = must(first.memory().get("w:hus"));

    world.clock.now += DAY;
    device.stopAfter(1);

    expect(
      await failure(first.applyReviews([{ grade: "good", id: "w:hus" }]))
    ).toBe(STOPPED);

    const expected = must(first.memory().get("w:hus"));
    const second = await device.launch();

    expect(second.memory().get("w:hus")).toEqual(expected);
    expect(expected.card.reps).toBe(taught.card.reps + 1);
    expect(await logOf(second)).toHaveLength(2);

    const third = await device.launch();

    expect(third.memory().get("w:hus")).toEqual(expected);
    expect(await logOf(third)).toHaveLength(2);
  });

  test("a new item whose log entry was saved but whose memory was not is finished on restart", async () => {
    const world = createWorld();
    const device = offlineDevice(world);
    const first = await device.launch({ writes: 1 });

    expect(await failure(first.teach(["w:hus", "w:bil"]))).toBe(STOPPED);

    const expected = new Map(first.memory());
    const second = await device.launch();

    expect(new Map(second.memory())).toEqual(expected);
    expect(await logOf(second)).toHaveLength(2);
  });

  test("if the app stops again while finishing, the next restart finishes", async () => {
    const world = createWorld();
    const device = offlineDevice(world);
    const first = await device.launch({ writes: 1 });

    expect(await failure(first.teach(["w:hus"]))).toBe(STOPPED);
    expect(await failure(device.launch({ writes: 0 }))).toBe(STOPPED);

    const third = await device.launch();

    expect(third.memory().has("w:hus")).toBe(true);
    expect(await logOf(third)).toHaveLength(1);
  });

  test("a write that fails while the app keeps running is made up for by the next one", async () => {
    const world = createWorld();
    const device = offlineDevice(world);
    const first = await device.launch();

    await first.teach(["w:hus", "w:bil"]);
    world.clock.now += DAY;
    device.stopAfter(1);

    expect(
      await failure(first.applyReviews([{ grade: "good", id: "w:hus" }]))
    ).toBe(STOPPED);

    // The device can write again, and the app was never restarted.
    device.stopAfter(1000);
    await first.applyReviews([{ grade: "again", id: "w:bil" }]);

    const expected = new Map(first.memory());
    const second = await device.launch();

    expect(new Map(second.memory())).toEqual(expected);
    expect(await logOf(second)).toHaveLength(4);
  });

  test("a finished review reaches the server", async () => {
    const world = createWorld();
    const device = offlineDevice(world);
    const first = await device.launch({ writes: 1 });

    expect(await failure(first.teach(["w:hus"]))).toBe(STOPPED);

    device.account = EMAIL;
    await device.launch();

    expect(world.server.memory().map((mem) => mem.id)).toEqual(["w:hus"]);
    expect(world.server.log().map((entry) => entry.id)).toEqual(["w:hus"]);
  });
});

/** Two signed-in devices holding the same two items. */
const pair = async () => {
  const world = createWorld();
  const phone = world.device("phone");
  const laptop = world.device("laptop");
  const learner = await phone.launch();

  await learner.teach(["w:hus", "w:bil"]);
  await learner.addStudyTime(MINUTE);
  await learner.syncNow();
  await laptop.launch();

  return { laptop, phone, world };
};

describe("stopping the app while it syncs", () => {
  test("a device stopped after any write of its first sync ends with the same data as the other", async () => {
    const world = createWorld();
    const phone = world.device("phone");
    const learner = await phone.launch();

    await learner.teach(["w:hus", "w:bil", "w:katt"]);
    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);
    await learner.syncNow();

    const expected = await shared(learner);
    const whole = world.device("whole");

    await whole.launch();

    const writes = whole.writes();

    expect(writes).toBeGreaterThan(1);

    await Promise.all(
      Array.from({ length: writes }, async (_, allowed) => {
        const device = world.device(`stopped-${allowed}`);

        // The first write notes who is signed in; without it the app does not start at all.
        await device.launch({ writes: allowed }).catch(() => null);

        const second = await device.launch();

        expect(await shared(second)).toEqual(expected);
      })
    );
  });

  test("Start over, stopped after any write, ends the same on both devices", async () => {
    await Promise.all(
      Array.from({ length: 6 }, async (_, allowed) => {
        const { laptop, phone } = await pair();
        const before = await shared(phone.learner());

        phone.stopAfter(allowed);
        await phone
          .learner()
          .startOver()
          .catch(() => null);
        await phone.launch();
        await laptop.learner().syncNow();
        await phone.learner().syncNow();

        const after = await shared(phone.learner());

        expect(await shared(laptop.learner())).toEqual(after);
        expect(after).toEqual(allowed === 0 ? before : { log: [], memory: [] });
      })
    );
  });

  test("Restore backup, stopped after any write, ends the same on both devices", async () => {
    await Promise.all(
      Array.from({ length: 6 }, async (_, allowed) => {
        const { laptop, phone, world } = await pair();
        const backup = await phone.learner().exportBackup();
        const saved = await shared(phone.learner());

        world.clock.now += DAY;
        await phone.learner().teach(["w:katt"]);
        await phone.learner().syncNow();
        await laptop.learner().syncNow();

        const before = await shared(phone.learner());

        phone.stopAfter(allowed);
        await phone
          .learner()
          .restoreBackup(backup)
          .catch(() => null);
        await phone.launch();
        await laptop.learner().syncNow();
        await phone.learner().syncNow();

        const after = await shared(phone.learner());

        expect(before.memory).toHaveLength(3);
        expect(await shared(laptop.learner())).toEqual(after);
        expect(after).toEqual(allowed === 0 ? before : saved);
      })
    );
  });
});
