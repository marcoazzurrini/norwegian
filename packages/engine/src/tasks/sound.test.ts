import { describe, expect, test } from "bun:test";

import { soundTask } from "../index";
import type { Effect, SoundEvent } from "../index";
import { course, must, play } from "../testing";

const { sounds } = course;

const pair = must(sounds[0]);

/** The second question of a drill, playing the first word of the pair. */
const run = (events: SoundEvent[]) =>
  play(soundTask, { index: 1, pair, target: "a" }, events);

const hear = (side: "a" | "b"): Effect => ({
  rate: 0.8,
  text: pair[side].word,
  type: "speak",
  voiceIndex: 1,
});

const answered = (right: boolean): Effect => ({
  group: pair.group,
  right,
  type: "soundAnswered",
});

const next: SoundEvent = { type: "continue" };

describe("a sound question", () => {
  test("starts silent with nothing picked; the app asks for the word to be played", () => {
    expect(run([])).toMatchObject({ effects: [], state: { picked: null } });
    expect(run([{ type: "play" }]).effects).toEqual([hear("a")]);
  });

  test("the word is played slowly, in the voice of this question, as often as asked", () => {
    expect(run([{ type: "play" }, { type: "play" }]).effects).toEqual([
      hear("a"),
      hear("a"),
    ]);
  });

  test("picking the word that was played counts as right", () => {
    const { effects, state } = run([{ side: "a", type: "tap" }]);

    expect(state).toMatchObject({ done: false, picked: "a", right: true });
    expect(effects).toEqual([answered(true)]);
    expect(run([{ side: "a", type: "tap" }, next]).effects.at(-1)).toEqual({
      result: { itemIds: [], right: 1, taught: 0, wrong: 0 },
      type: "done",
    });
  });

  test("picking the other word counts as wrong", () => {
    const { effects, state } = run([{ side: "b", type: "key" }, next]);

    expect(state).toMatchObject({ done: true, picked: "b", right: false });
    expect(effects).toEqual([
      answered(false),
      {
        result: { itemIds: [], right: 0, taught: 0, wrong: 1 },
        type: "done",
      },
    ]);
  });

  test("after the pick, tapping a word plays it and the answer is not counted again", () => {
    const { effects, state } = run([
      { side: "a", type: "tap" },
      { side: "b", type: "tap" },
      { side: "a", type: "tap" },
    ]);

    expect(state.picked).toBe("a");
    expect(effects).toEqual([answered(true), hear("b"), hear("a")]);
  });

  test("after the pick, the keyboard does nothing", () => {
    expect(
      run([
        { side: "a", type: "tap" },
        { side: "b", type: "key" },
      ])
    ).toEqual(run([{ side: "a", type: "tap" }]));
  });

  test("the learner cannot go on before picking", () => {
    expect(run([next])).toEqual(run([]));
  });

  test("a finished question ignores every event", () => {
    const events: SoundEvent[] = [{ side: "a", type: "tap" }, next];

    expect(
      run([...events, next, { type: "play" }, { side: "b", type: "tap" }])
    ).toEqual(run(events));
  });
});
