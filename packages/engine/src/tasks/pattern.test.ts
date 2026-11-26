import { describe, expect, test } from "bun:test";

import type { Sentence } from "@norsk/course";

import { patternTask } from "../index";
import type { Effect, PatternEvent } from "../index";
import { course, T0, itemsOf, must, play, sentenceOf } from "../testing";

const { item } = course;

const neg = item("p:neg");
const quiz = must(neg.quiz);
const first = must(quiz[0]);
const second = must(quiz[1]);
const rightFirst = must(first.options[0]);
const wrongFirst = must(first.options[1]);
const rightSecond = must(second.options[0]);
const one = sentenceOf("Jeg forstår ikke.");
const two = sentenceOf("Jeg snakker ikke norsk.");
const practice = [one, two];

/** Everything up to the lesson that teaches the pattern, and the other items of that lesson. */
const known = itemsOf([0, 1, 2, 3]);

known.delete(neg.id);

const next: PatternEvent = { type: "continue" };
const after: PatternEvent = { type: "next" };
const pick = (option: string): PatternEvent => ({ option, type: "pick" });

const answer = (s: Sentence): PatternEvent => ({
  text: s.target,
  type: "answer",
});

const teach: Effect = { ids: [neg.id], type: "teach" };

const run = (events: PatternEvent[], sentences = practice, pattern = neg) =>
  play(patternTask, { item: pattern, known, practice: sentences }, events);

/** Both reading questions answered correctly. */
const read = [next, pick(rightFirst), after, pick(rightSecond), after];

describe("a pattern", () => {
  test("starts with the examples, and has a third step when there are sentences to practise", () => {
    const { effects, state } = run([]);

    expect(state.phase).toEqual({ step: "see" });
    expect(state.steps).toBe(3);
    expect(effects).toEqual([]);
    expect(run([], []).state.steps).toBe(2);
  });

  test("a wrong pick is marked once, and the learner stays on the question", () => {
    const { effects, state } = run([
      next,
      pick(wrongFirst),
      pick(wrongFirst),
      after,
    ]);

    expect(state.phase).toEqual({
      quiz: { answered: false, index: 0, question: first, wrong: [wrongFirst] },
      step: "read",
    });
    expect(effects).toEqual([]);
  });

  test("the right pick is marked, and the next question comes after the pause", () => {
    const marked = run([
      next,
      pick(wrongFirst),
      pick(rightFirst),
      pick(wrongFirst),
    ]);

    expect(marked.state.phase).toMatchObject({
      quiz: { answered: true, index: 0, wrong: [wrongFirst] },
    });

    const moved = run([next, pick(rightFirst), after]);

    expect(moved.state.phase).toEqual({
      quiz: { answered: false, index: 1, question: second, wrong: [] },
      step: "read",
    });
    expect(moved.effects).toEqual([]);
  });

  test("the pattern is taught after the last question, before the sentences", () => {
    const { effects, state } = run(read);

    expect(effects).toEqual([teach]);
    expect(state.phase).toMatchObject({
      index: 0,
      sentence: { phase: { step: "ask" }, sentence: one },
      step: "produce",
    });

    // The practice sentences review the new pattern too.
    const { phase } = state;

    expect(
      phase.step === "produce" && phase.sentence.covered.includes(neg.id)
    ).toBe(true);
  });

  test("without sentences the task ends when the pattern is taught", () => {
    const { effects, state } = run(read, []);

    expect(state.done).toBe(true);
    expect(effects).toEqual([
      teach,
      {
        result: { itemIds: [neg.id], right: 0, taught: 1, wrong: 0 },
        type: "done",
      },
    ]);
  });

  test("without questions the pattern is taught straight after the examples", () => {
    const { effects, state } = run([next], practice, { ...neg, quiz: [] });

    expect(effects).toEqual([teach]);
    expect(state.phase).toMatchObject({ index: 0, step: "produce" });
  });

  test("each practice sentence is reviewed as it ends, and the task ends after the last", () => {
    const afterOne = run([...read, answer(one), next]);

    expect(afterOne.state.done).toBe(false);
    expect(afterOne.state.phase).toMatchObject({
      index: 1,
      sentence: { phase: { step: "ask" }, sentence: two },
      step: "produce",
    });
    expect(afterOne.effects.map((effect) => effect.type)).toEqual([
      "teach",
      "speak",
      "review",
      "sentenceSeen",
    ]);
    expect(afterOne.effects.at(-1)).toEqual({
      at: T0,
      id: one.id,
      type: "sentenceSeen",
    });

    const ended = run([...read, answer(one), next, answer(two), next]);

    expect(ended.state.done).toBe(true);
    expect(ended.effects.map((effect) => effect.type)).toEqual([
      "teach",
      "speak",
      "review",
      "sentenceSeen",
      "speak",
      "review",
      "sentenceSeen",
      "done",
    ]);
  });

  test("the result counts the pattern as taught and adds up the practice sentences", () => {
    const ended = run([
      ...read,
      // First sentence: wrong, then shown. Its missed items fail.
      { text: "jeg forstår", type: "answer" },
      { type: "reveal" },
      next,
      answer(two),
      next,
    ]);

    const reviews = ended.effects.flatMap((effect) =>
      effect.type === "review" ? effect.inputs : []
    );

    const failed = reviews.filter((input) => input.grade === "again");

    expect(failed.map((input) => input.id)).toEqual(["w:ikke:adv", neg.id]);
    expect(reviews.every((input) => input.carrier === true)).toBe(true);
    expect(ended.effects.at(-1)).toEqual({
      result: {
        itemIds: [neg.id],
        right: reviews.length - failed.length,
        taught: 1,
        wrong: failed.length,
      },
      type: "done",
    });
  });

  test("events that do not fit the step change nothing", () => {
    expect(
      run([pick(rightFirst), after, { text: "hei", type: "answer" }])
    ).toEqual(run([]));
    expect(run([next, next, { type: "reveal" }, { type: "typo" }])).toEqual(
      run([next])
    );
    expect(run([...read, pick(rightFirst), after])).toEqual(run(read));
  });

  test("a finished pattern ignores every event", () => {
    const ended = run(read, []);

    expect(run([...read, next, after, pick(rightFirst)], [])).toEqual(ended);
  });
});
