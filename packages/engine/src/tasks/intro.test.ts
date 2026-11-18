import { describe, expect, test } from "bun:test";

import { item } from "@norsk/content";

import { introTask } from "../index";
import type { Effect, IntroEvent } from "../index";
import { itemsOf, play } from "../testing";

const group = [item("c:hei"), item("c:ha-det-bra"), item("w:takk:interj")];
const ids = group.map((it) => it.id);
const next: IntroEvent = { type: "continue" };
const answer = (text: string): IntroEvent => ({ text, type: "answer" });
const hear = (text: string): Effect => ({ text, type: "speak" });
const teach = (id: string): Effect => ({ ids: [id], type: "teach" });

const run = (events: IntroEvent[], items = group) =>
  play(introTask, { items, known: new Set<string>() }, events);

/** Every item has been shown; the first one is waiting to be typed. */
const shown = [next, next, next];

describe("an intro", () => {
  test("starts by showing and playing the first item", () => {
    const { effects, state } = run([]);

    expect(state).toMatchObject({
      done: false,
      help: "none",
      index: 0,
      item: group[0],
      phase: "show",
      recalled: false,
    });
    expect(effects).toEqual([hear("hei")]);
  });

  test("each item is shown and played once, then recall starts without audio", () => {
    const second = run([next]);

    expect(second.state).toMatchObject({ index: 1, phase: "show" });
    expect(second.effects).toEqual([hear("hei"), hear("ha det bra")]);

    const recall = run(shown);

    expect(recall.state).toMatchObject({
      index: 0,
      item: group[0],
      phase: "recall",
    });
    expect(recall.effects).toEqual([
      hear("hei"),
      hear("ha det bra"),
      hear("takk"),
    ]);
  });

  test("typing while the items are still being shown does nothing", () => {
    expect(run([answer("hei")])).toEqual(run([]));
  });

  test("a right answer teaches the item, then plays it", () => {
    const { effects, state } = run([...shown, answer(" Hei ")]);

    expect(state).toMatchObject({ misses: 0, recalled: true, typed: "Hei" });
    expect(effects.slice(3)).toEqual([teach("c:hei"), hear("hei")]);
  });

  test("all right the first time: three taught, three right", () => {
    const { effects, state } = run([
      ...shown,
      answer("hei"),
      next,
      answer("ha det bra"),
      next,
      answer("takk"),
      next,
    ]);

    expect(state.done).toBe(true);
    expect(
      effects.filter((effect): boolean => effect.type === "teach")
    ).toEqual(ids.map((id) => teach(id)));
    expect(effects.at(-1)).toEqual({
      result: { itemIds: ids, right: 3, taught: 3, wrong: 0 },
      type: "done",
    });
  });

  test("the first miss gets a hint, the second the answer to copy, and nothing is taught yet", () => {
    const once = run([...shown, answer("nei")]);

    expect(once.state).toMatchObject({
      help: "start",
      misses: 1,
      recalled: false,
      typed: "nei",
    });

    const twice = run([...shown, answer("nei"), answer("nei")]);

    expect(twice.state).toMatchObject({ help: "copy", misses: 2 });
    expect(twice.effects).toHaveLength(3);
  });

  test("a noun with the wrong article gets a hint at the article", () => {
    const hus = item("w:hus:noun");
    const { state } = run([next, answer("en hus")], [hus]);

    expect(state).toMatchObject({ help: "article", misses: 1 });
  });

  test("an item that needed more than one try counts as wrong once, and is still taught", () => {
    const { effects } = run([
      ...shown,
      answer("nei"),
      answer("nei"),
      answer("hei"),
      next,
      answer("ha det bra"),
      next,
      answer("tak"),
      answer("takk"),
      next,
    ]);

    expect(effects.at(-1)).toEqual({
      result: { itemIds: ids, right: 1, taught: 3, wrong: 2 },
      type: "done",
    });
    expect(effects.filter((effect) => effect.type === "teach")).toHaveLength(3);
  });

  test("the next item starts with a clean slate", () => {
    const { state } = run([...shown, answer("nei"), answer("hei"), next]);

    expect(state).toMatchObject({
      help: "none",
      index: 1,
      item: group[1],
      missed: 1,
      misses: 0,
      recalled: false,
      typed: "",
    });
  });

  test("the learner cannot go on before the item is recalled, or answer it twice", () => {
    expect(run([...shown, next])).toEqual(run(shown));
    expect(run([...shown, answer("hei"), answer("nei")])).toEqual(
      run([...shown, answer("hei")])
    );
  });

  test("a finished intro ignores every event", () => {
    const events = [next, answer("hei"), next];
    const ended = run(events, [item("c:hei")]);

    expect(ended.state.done).toBe(true);
    expect(run([...events, next, answer("hei")], [item("c:hei")])).toEqual(
      ended
    );
  });

  test("the example is the shortest taught sentence that uses the new item", () => {
    const hus = item("w:hus:noun");

    const taught = play(
      introTask,
      { items: [hus], known: itemsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) },
      []
    ).state.example;

    expect(taught?.tokens.some((t) => t.w === hus.id)).toBe(true);
    expect(run([], [hus]).state.example).toBeNull();
  });

  test("an intro needs at least one item", () => {
    expect(() => run([], [])).toThrow("at least one item");
  });
});
