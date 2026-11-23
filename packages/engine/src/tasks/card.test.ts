import { describe, expect, test } from "bun:test";

import { item } from "@norsk/content";

import { cardTask } from "../index";
import type { CardEvent, Effect } from "../index";
import { play } from "../testing";

const hus = item("w:hus:noun");
const run = (events: CardEvent[]) => play(cardTask, { item: hus }, events);
const answer = (text: string): CardEvent => ({ text, type: "answer" });

// The word is heard as it is shown, with its article.
const hear: Effect = { text: "et hus", type: "speak" };

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
      answered: true,
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

    expect(state.phase).toEqual({
      asked: false,
      hint: "start",
      step: "retry",
    });
    expect(state.typed).toBe("hytte");
    expect(effects).toEqual([]);
  });

  test("the right word with the wrong article gets a hint at the article", () => {
    expect(run([answer("en hus")]).state.phase).toEqual({
      asked: false,
      hint: "article",
      step: "retry",
    });
  });

  test("wrong then right: shown as correct, but recorded as forgotten", () => {
    const shown = run([answer("hytte"), answer("et hus")]);

    expect(shown.state.phase).toEqual({
      answered: true,
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

  test("wrong twice: the answer is shown to copy, and copying it records the item as forgotten", () => {
    const events = [answer("hytte"), answer("en hus")];
    const shown = run(events);

    expect(shown.state.phase).toEqual({ answered: true, step: "copy" });
    expect(shown.effects).toEqual([]);

    // A wrong copy changes nothing but what was typed.
    expect(run([...events, answer("et huz")]).state.phase).toEqual(
      shown.state.phase
    );

    const copied = run([...events, answer("et hus")]);

    expect(copied.state.phase).toEqual({
      answered: true,
      correct: false,
      firstTry: false,
      step: "result",
    });
    expect(
      run([...events, answer("et hus"), { type: "continue" }]).effects
    ).toEqual([hear, ...recorded("again")]);
  });

  test("asking for the hint before trying gives the start of the word, and a right answer after it is still forgotten", () => {
    const hinted = run([{ type: "hint" }]);

    expect(hinted.state.phase).toEqual({
      asked: true,
      hint: "start",
      step: "retry",
    });
    expect(hinted.state.typed).toBe("");

    // There is one hint only.
    expect(run([{ type: "hint" }, { type: "hint" }])).toEqual(hinted);
    expect(run([answer("hytte"), { type: "hint" }])).toEqual(
      run([answer("hytte")])
    );

    const ended = run([
      { type: "hint" },
      answer("et hus"),
      { type: "continue" },
    ]);

    expect(ended.effects).toEqual([hear, ...recorded("again")]);
  });

  test("“I don’t know” shows the answer to copy at once, and is recorded as forgotten", () => {
    const shown = run([{ type: "reveal" }]);

    expect(shown.state.phase).toEqual({ answered: false, step: "copy" });
    expect(run([{ type: "hint" }, { type: "reveal" }]).state.phase).toEqual(
      shown.state.phase
    );

    const ended = run([
      { type: "reveal" },
      answer("et hus"),
      { type: "continue" },
    ]);

    expect(ended.effects).toEqual([hear, ...recorded("again")]);
  });

  test("“I don’t know” after a miss keeps what was typed", () => {
    const shown = run([answer("hytte"), { type: "reveal" }]);

    expect(shown.state.phase).toEqual({ answered: true, step: "copy" });
    expect(shown.state.typed).toBe("hytte");
    expect(shown.effects).toEqual([]);
  });

  test("giving up without an answer cannot be called a typo", () => {
    const copied = [{ type: "reveal" } as const, answer("et hus")];

    expect(run([...copied, { type: "typo" }])).toEqual(run(copied));
  });

  test("a miss the learner calls a typo is recorded as remembered", () => {
    const ended = run([answer("hytte"), answer("et hus"), { type: "typo" }]);

    expect(ended.effects).toEqual([hear, ...recorded("good")]);
  });

  test("an answer after asking for the hint cannot be called a typo", () => {
    const hint = { type: "hint" } as const;
    const typo = { type: "typo" } as const;

    // Right after the hint.
    const passed = [hint, answer("et hus")];

    expect(run(passed).state.phase).toEqual({
      answered: false,
      correct: true,
      firstTry: false,
      step: "result",
    });
    expect(run([...passed, typo])).toEqual(run(passed));

    // Wrong after the hint, then copied.
    const copied = [hint, answer("et hsu"), answer("et hus")];

    expect(run([hint, answer("et hsu")]).state.phase).toEqual({
      answered: false,
      step: "copy",
    });
    expect(run([...copied, typo])).toEqual(run(copied));
    expect(run([...copied, { type: "continue" }]).effects).toEqual([
      hear,
      ...recorded("again"),
    ]);
  });

  test("events that do not fit the phase change nothing", () => {
    const asking = run([]);

    expect(run([{ type: "continue" }, { type: "typo" }])).toEqual(asking);

    const copying = run([{ type: "reveal" }]);

    expect(
      run([
        { type: "reveal" },
        { type: "reveal" },
        { type: "hint" },
        { type: "continue" },
      ])
    ).toEqual(copying);

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
