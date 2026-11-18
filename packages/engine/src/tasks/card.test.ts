import { describe, expect, test } from "bun:test";

import { item } from "@norsk/content";

import { cardTask } from "../index";
import type { CardEvent, Effect } from "../index";
import { play } from "../testing";

const hus = item("w:hus:noun");
const run = (events: CardEvent[]) => play(cardTask, { item: hus }, events);
const answer = (text: string): CardEvent => ({ text, type: "answer" });
const hear: Effect = { text: "hus", type: "speak" };

const recorded = (grade: "good" | "again"): Effect[] => [
  { inputs: [{ grade, id: hus.id }], type: "review" },
  {
    result: {
      itemIds: [hus.id],
      right: grade === "good" ? 1 : 0,
      taught: 0,
      wrong: grade === "good" ? 0 : 1,
    },
    type: "done",
  },
];

describe("a card", () => {
  test("starts by asking, with nothing to do", () => {
    expect(run([])).toEqual({
      effects: [],
      state: { done: false, item: hus, phase: { step: "ask" }, typed: "" },
    });
  });

  test("right the first time: the answer is played, then recorded as remembered", () => {
    const shown = run([answer(" Et hus ")]);

    expect(shown.state.typed).toBe("Et hus");
    expect(shown.state.phase).toEqual({
      correct: true,
      firstTry: true,
      step: "result",
    });
    expect(shown.effects).toEqual([hear]);

    const ended = run([answer("et hus"), { type: "continue" }]);

    expect(ended.state.done).toBe(true);
    expect(ended.effects).toEqual([hear, ...recorded("good")]);
  });

  test("a wrong word gets a hint at how it starts, and no audio yet", () => {
    const { effects, state } = run([answer("hytte")]);

    expect(state.phase).toEqual({ hint: "start", step: "retry" });
    expect(state.typed).toBe("hytte");
    expect(effects).toEqual([]);
  });

  test("the right word with the wrong article gets a hint at the article", () => {
    expect(run([answer("en hus")]).state.phase).toEqual({
      hint: "article",
      step: "retry",
    });
  });

  test("wrong then right: shown as correct, but recorded as forgotten", () => {
    const shown = run([answer("hytte"), answer("et hus")]);

    expect(shown.state.phase).toEqual({
      correct: true,
      firstTry: false,
      step: "result",
    });
    expect(shown.effects).toEqual([hear]);

    const ended = run([
      answer("hytte"),
      answer("et hus"),
      { type: "continue" },
    ]);

    expect(ended.effects).toEqual([hear, ...recorded("again")]);
  });

  test("wrong twice: the answer is shown and the item is recorded as forgotten", () => {
    const events = [answer("hytte"), answer("en hus")];

    expect(run(events).state.phase).toEqual({
      correct: false,
      firstTry: false,
      step: "result",
    });
    expect(run([...events, { type: "continue" }]).effects).toEqual([
      hear,
      ...recorded("again"),
    ]);
  });

  test("showing the answer after a miss counts as forgotten", () => {
    const shown = run([answer("hytte"), { type: "reveal" }]);

    expect(shown.state.phase).toEqual({
      correct: false,
      firstTry: false,
      step: "result",
    });
    expect(shown.state.typed).toBe("hytte");
    expect(shown.effects).toEqual([hear]);
  });

  test("a miss the learner calls a typo is recorded as remembered", () => {
    const ended = run([answer("hytte"), answer("et hus"), { type: "typo" }]);

    expect(ended.effects).toEqual([hear, ...recorded("good")]);
  });

  test("events that do not fit the phase change nothing", () => {
    const asking = run([]);

    expect(
      run([{ type: "reveal" }, { type: "continue" }, { type: "typo" }])
    ).toEqual(asking);

    const shown = run([answer("et hus")]);

    expect(
      run([answer("et hus"), answer("hytte"), { type: "reveal" }])
    ).toEqual(shown);
  });

  test("a finished card ignores every event", () => {
    const ended = run([answer("et hus"), { type: "continue" }]);

    expect(
      run([
        answer("et hus"),
        { type: "continue" },
        { type: "continue" },
        { type: "typo" },
        answer("hytte"),
      ])
    ).toEqual(ended);
  });
});
