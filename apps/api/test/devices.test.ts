import { LOG_PAGE } from "@norsk/protocol";
import { beforeEach, describe, expect, test } from "vitest";

import { clock, Device } from "./device";
import { signIn } from "./helpers";

const MINUTE = 60_000;

let phone: Device;
let laptop: Device;

beforeEach(async () => {
  // Both devices are signed in to the same account, each with its own session.
  phone = new Device("phone", await signIn(), "mia");
  laptop = new Device("laptop", await signIn());
});

const later = (ms = MINUTE) => {
  clock.now += ms;
};

describe("two devices", () => {
  test("study apart, then sync, and end with the same data", async () => {
    phone.teach("w:hus:noun", "w:bil:noun");
    phone.study(5 * MINUTE, "2026-11-17");
    later();
    laptop.teach("w:bok:noun", "w:hus:noun");
    laptop.study(3 * MINUTE, "2026-11-18");
    later();
    // Both reviewed the same word; the laptop did so last.
    phone.review("w:hus:noun", "again");
    later();
    laptop.review("w:hus:noun");
    later();
    laptop.setMinutes(25);
    later();

    await phone.sync();
    await laptop.sync();
    await phone.sync();

    expect(phone.data()).toEqual(laptop.data());
    expect(phone.memory.size).toBe(3);
    expect(phone.log.size).toBe(6);
    expect(phone.memory.get("w:hus:noun")?.card.reps).toBe(2);
    expect(phone.memory.get("w:hus:noun")?.card.lastReviewAt).toEqual(
      laptop.memory.get("w:hus:noun")?.card.lastReviewAt
    );
    expect(phone.meta).toMatchObject({
      days: ["2026-11-17", "2026-11-18"],
      totalMs: 5 * MINUTE,
    });
    expect(phone.meta.settings.minutes).toBe(25);
    // Each device keeps its own voice.
    expect(phone.meta.settings.voice).toBe("mia");
    expect(laptop.meta.settings.voice).toBeNull();
  });

  test("a sync with nothing new changes nothing", async () => {
    phone.teach("w:hus:noun");
    later();
    await phone.sync();
    await laptop.sync();

    const before = laptop.data();

    later();
    await phone.sync();
    await laptop.sync();

    expect(laptop.data()).toEqual(before);
    expect(phone.data()).toEqual(before);
  });

  test("a long history travels in pages and arrives whole", async () => {
    phone.teach("w:hus:noun");

    for (let at = 0; at < LOG_PAGE + 300; at += 1) {
      later(1000);
      phone.review("w:hus:noun");
    }

    later();

    // Two messages to send it, two to fetch it.
    expect(await phone.sync()).toBe(2);
    expect(await laptop.sync()).toBe(2);
    expect(laptop.log.size).toBe(LOG_PAGE + 301);
    expect(laptop.data()).toEqual(phone.data());
  });

  test("a Start over on one device clears the other", async () => {
    phone.teach("w:hus:noun");
    later();
    await phone.sync();
    await laptop.sync();
    later();
    // The laptop studies on, not knowing what is about to happen.
    laptop.teach("w:bok:noun");
    later();

    phone.startOver();
    await phone.sync();
    await laptop.sync();

    expect(laptop.memory.size).toBe(0);
    expect(laptop.log.size).toBe(0);
    expect(laptop.data()).toEqual(phone.data());
    expect(laptop.cursors.epoch).toBe(phone.cursors.epoch);

    // Nothing of the old generation came back to the server.
    const fresh = new Device("tablet", await signIn());

    await fresh.sync();

    expect(fresh.memory.size).toBe(0);
    expect(fresh.log.size).toBe(0);
  });

  test("after a Start over both devices go on syncing", async () => {
    phone.teach("w:hus:noun");
    later();
    await phone.sync();
    await laptop.sync();
    later();
    phone.startOver();
    await phone.sync();
    await laptop.sync();
    later();

    laptop.teach("w:ny:adj");
    later();
    await laptop.sync();
    await phone.sync();

    expect([...phone.memory.keys()]).toEqual(["w:ny:adj"]);
    expect(phone.data()).toEqual(laptop.data());
  });

  test("of two Start overs, the later one wins on both devices", async () => {
    phone.teach("w:hus:noun");
    later();
    await phone.sync();
    await laptop.sync();
    later();

    phone.startOver();
    later();
    laptop.startOver();
    later();
    laptop.teach("w:etter:prep");
    later();

    // The laptop's reset is newer and reaches the server first; the phone's is then refused.
    await laptop.sync();
    await phone.sync();
    await laptop.sync();

    expect(phone.cursors.epoch).toBe(laptop.cursors.epoch);
    expect([...phone.memory.keys()]).toEqual(["w:etter:prep"]);
    expect(phone.data()).toEqual(laptop.data());
  });
});
