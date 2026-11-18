// The hooks are one line each: they hand React the learner's `subscribe` and one of its reads.
// React draws a component again only when that read returns a different value, so what matters is
// that each read keeps its value while another part changes. That is tested here, with a stand-in
// for a component that follows React's rule; see also "reading one part at a time" in learner.test.ts.
import { describe, expect, test } from "bun:test";

import type { Learner } from "./index";
import { createLearnerHooks } from "./react";
import { createWorld, DAY } from "./testing";

/** Counts how often a component that reads `read` would be drawn again. */
const watch = (learner: Learner, read: () => object | boolean) => {
  let seen = read();
  let draws = 0;

  const stop = learner.subscribe(() => {
    const next = read();

    if (!Object.is(next, seen)) {
      seen = next;
      draws += 1;
    }
  });

  return { draws: () => draws, stop };
};

describe("the hooks", () => {
  test("there is one for each read", async () => {
    const world = createWorld();
    const hooks = createLearnerHooks(await world.device("phone").launch());

    expect(Object.keys(hooks).toSorted()).toEqual([
      "useMemory",
      "useProgress",
      "useReady",
      "useScheduler",
      "useSettings",
      "useSyncStatus",
    ]);
  });

  test("a review draws again only what shows the memory", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    const learner = await phone.launch();

    await learner.teach(["w:hus"]);

    const memory = watch(learner, learner.memory);
    const settings = watch(learner, learner.settings);
    const progress = watch(learner, learner.progress);
    const status = watch(learner, learner.syncStatus);
    const scheduler = watch(learner, learner.scheduler);

    world.clock.now += DAY;
    await learner.applyReviews([{ grade: "good", id: "w:hus" }]);

    expect(memory.draws()).toBe(1);
    expect(settings.draws()).toBe(0);
    expect(progress.draws()).toBe(0);
    expect(status.draws()).toBe(0);
    expect(scheduler.draws()).toBe(0);
  });

  test("study time draws again only what shows the counters", async () => {
    const world = createWorld();
    const phone = world.device("phone");

    phone.account = null;

    const learner = await phone.launch();
    const memory = watch(learner, learner.memory);
    const settings = watch(learner, learner.settings);
    const progress = watch(learner, learner.progress);

    await learner.addStudyTime(1000);

    expect(progress.draws()).toBe(1);
    expect(memory.draws()).toBe(0);
    expect(settings.draws()).toBe(0);
  });

  test("a sync that brings nothing new draws again only what shows the sync", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();

    await learner.teach(["w:hus"]);
    await learner.updateSettings({ minutes: 20 });
    await learner.addStudyTime(1000);
    await learner.markSentenceSeen("Jeg har et hus.");
    await learner.syncNow();

    const memory = watch(learner, learner.memory);
    const settings = watch(learner, learner.settings);
    const progress = watch(learner, learner.progress);
    const status = watch(learner, learner.syncStatus);

    world.clock.now += DAY;
    await learner.syncNow();

    expect(status.draws()).toBeGreaterThan(0);
    expect(progress.draws()).toBe(0);
    expect(settings.draws()).toBe(0);
    expect(memory.draws()).toBe(0);
  });

  test("a new recall target reaches what shows the scheduler", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();
    const scheduler = watch(learner, learner.scheduler);

    await learner.updateSettings({ desiredRetention: 0.8 });

    expect(scheduler.draws()).toBe(1);
  });

  test("after stop, nothing is watched", async () => {
    const world = createWorld();
    const learner = await world.device("phone").launch();
    const memory = watch(learner, learner.memory);

    memory.stop();
    await learner.teach(["w:hus"]);

    expect(memory.draws()).toBe(0);
  });
});
