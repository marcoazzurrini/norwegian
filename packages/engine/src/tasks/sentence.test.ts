import { describe, expect, test } from "bun:test";

import type { Sentence } from "@norsk/content";

import { explainRequest, sentenceTask } from "../index";
import type { Effect, SentenceEvent } from "../index";
import { T0, play, sentenceOf } from "../testing";

const snakker = sentenceOf("Jeg snakker ikke norsk.");

/** Every item the sentence exercises, in the order of its words. */
const all = [
  "w:jeg:pron",
  "w:snakke:verb",
  "p:present",
  "w:ikke:adv",
  "p:neg",
  "w:norsk:adj",
];

const answer = (text: string): SentenceEvent => ({ text, type: "answer" });
const next: SentenceEvent = { type: "continue" };
const hear = (s: Sentence): Effect => ({ text: s.no, type: "speak" });

const run = (
  events: SentenceEvent[],
  sentence = snakker,
  known: string[] = all
) => play(sentenceTask, { known: new Set(known), sentence }, events);

/** The effects of finishing the sentence: reviews, the time it was seen, and the result. */
const recorded = (
  covered: string[],
  failed: string[],
  s = snakker
): Effect[] => [
  {
    inputs: covered.map((id) => ({
      carrier: true,
      grade: failed.includes(id) ? "again" : "good",
      id,
    })),
    type: "review",
  },
  { at: T0, id: s.id, type: "sentenceSeen" },
  {
    result: {
      itemIds: covered,
      right: covered.length - failed.length,
      taught: 0,
      wrong: failed.length,
    },
    type: "done",
  },
];

describe("a sentence", () => {
  test("starts by asking, and covers every taught item in it", () => {
    const { effects, state } = run([]);

    expect(state.phase).toEqual({ step: "ask" });
    expect(new Set(state.covered)).toEqual(new Set(all));
    expect(effects).toEqual([]);
    expect(explainRequest(state)).toBeNull();
  });

  test("right the first time: every item passes as a recall inside a sentence", () => {
    const shown = run([answer("jeg snakker ikke norsk")]);

    expect(shown.state.phase).toMatchObject({
      failed: [],
      passed: true,
      step: "result",
    });
    expect(shown.effects).toEqual([hear(snakker)]);
    expect(explainRequest(shown.state)).toBeNull();

    const ended = run([answer("Jeg snakker ikke norsk."), next]);

    expect(ended.state.done).toBe(true);
    expect(ended.effects).toEqual([
      hear(snakker),
      ...recorded(ended.state.covered, []),
    ]);
  });

  test("a wrong word gets a hint at that word, and a request for a hint from the model", () => {
    const { effects, state } = run([answer("jeg snakker ikke engelsk")]);

    expect(state.phase).toMatchObject({
      close: true,
      failed: ["w:norsk:adj"],
      hint: { id: "w:norsk:adj", kind: "word" },
      step: "retry",
    });
    expect(effects).toEqual([]);
    expect(explainRequest(state)).toEqual({
      answer: "jeg snakker ikke engelsk",
      en: snakker.en,
      itemIds: ["w:norsk:adj"],
      kind: "hint",
      no: snakker.no,
    });
  });

  test("wrong then right: only the item missed on the first try fails", () => {
    const events = [
      answer("jeg snakker ikke engelsk"),
      answer("jeg snakker ikke norsk"),
    ];

    const shown = run(events);

    expect(shown.state.phase).toMatchObject({
      failed: ["w:norsk:adj"],
      passed: true,
      step: "result",
    });
    expect(shown.effects).toEqual([hear(snakker)]);
    expect(explainRequest(shown.state)).toMatchObject({
      answer: "jeg snakker ikke norsk",
      itemIds: ["w:norsk:adj"],
      kind: "explain",
    });

    const ended = run([...events, next]);

    expect(ended.effects).toEqual([
      hear(snakker),
      ...recorded(ended.state.covered, ["w:norsk:adj"]),
    ]);
  });

  test("wrong twice: the answer is shown, and still only the first misses fail", () => {
    const shown = run([
      answer("jeg snakker ikke engelsk"),
      answer("du er her"),
    ]);

    expect(shown.state.phase).toMatchObject({
      failed: ["w:norsk:adj"],
      passed: false,
      step: "result",
    });
    expect(explainRequest(shown.state)).toMatchObject({
      answer: "du er her",
      kind: "explain",
    });
  });

  test("showing the answer after a miss keeps the first answer on screen", () => {
    const { effects, state } = run([
      answer("jeg snakker ikke engelsk"),
      { type: "reveal" },
    ]);

    expect(state.phase).toMatchObject({
      failed: ["w:norsk:adj"],
      passed: false,
      step: "result",
    });
    expect(effects).toEqual([hear(snakker)]);
    expect(explainRequest(state)).toMatchObject({
      answer: "jeg snakker ikke engelsk",
    });
  });

  test("a miss the learner calls a typo fails nothing", () => {
    const ended = run([
      answer("jeg snakker ikke engelsk"),
      answer("jeg snakker ikke norsk"),
      { type: "typo" },
    ]);

    expect(ended.effects).toEqual([
      hear(snakker),
      ...recorded(ended.state.covered, []),
    ]);
  });

  test("a missing word fails the word and the pattern on it", () => {
    const { state } = run([answer("jeg snakker norsk")]);

    expect(state.phase).toMatchObject({
      failed: ["w:ikke:adv", "p:neg"],
      hint: { id: "w:ikke:adv", kind: "word" },
    });
  });

  test("a known word in the wrong form gets a hint at the pattern", () => {
    const huset = sentenceOf("Huset er stort.");

    const { state } = run([answer("hus er stort")], huset, [
      "w:hus:noun",
      "p:definite",
      "w:er:verb",
      "w:stor:adj",
    ]);

    expect(state.phase).toMatchObject({
      failed: ["w:hus:noun", "p:definite"],
      hint: { id: "p:definite", kind: "pattern" },
    });
  });

  test("the right words in the wrong order fail the word-order pattern, not the words", () => {
    const iDag = sentenceOf("I dag jobber jeg hjemme.");

    const known = [
      "c:i-dag",
      "w:jobbe:verb",
      "w:jeg:pron",
      "w:hjemme:adv",
      "p:v2",
    ];

    const { state } = run([answer("i dag jeg jobber hjemme")], iDag, known);

    expect(state.phase).toMatchObject({
      failed: ["p:v2"],
      hint: { kind: "order", pattern: "p:v2" },
    });

    // Before the pattern is taught there is no rule to name, and nothing to record against it.
    const early = run(
      [answer("i dag jeg jobber hjemme"), { type: "reveal" }, next],
      iDag,
      known.filter((id) => id !== "p:v2")
    );

    expect(early.state.covered).not.toContain("p:v2");
    expect(early.effects.at(-1)).toMatchObject({ result: { wrong: 0 } });
    expect(
      run([answer("i dag jeg jobber hjemme")], iDag, known.slice(0, 4)).state
        .phase
    ).toMatchObject({ hint: { kind: "order", pattern: null } });
  });

  test("a word too many fails nothing but still needs a second try", () => {
    const { state } = run([answer("jeg snakker ikke norsk nå")]);

    expect(state.phase).toMatchObject({
      close: true,
      failed: [],
      hint: { kind: "extra" },
      step: "retry",
    });
    expect(explainRequest(state)).toMatchObject({ itemIds: [], kind: "hint" });
  });

  test("a missed phrase gets a hint at the phrase, a missed name a general one", () => {
    const unnskyld = sentenceOf("Unnskyld, snakker du engelsk?");
    const anna = sentenceOf("Jeg heter Anna.");

    expect(
      run([answer("snakker du engelsk")], unnskyld, ["c:unnskyld"]).state.phase
    ).toMatchObject({ hint: { id: "c:unnskyld", kind: "chunk" } });
    expect(
      run([answer("jeg heter")], anna, ["c:jeg-heter"]).state.phase
    ).toMatchObject({ failed: [], hint: { kind: "unknown" } });
  });

  test("an answer that is far off is not called close", () => {
    expect(run([answer("hei")]).state.phase).toMatchObject({ close: false });
  });

  test("only taught items are reviewed", () => {
    const known = ["w:jeg:pron", "w:norsk:adj"];
    const ended = run([answer("jeg snakker ikke norsk"), next], snakker, known);

    expect(ended.state.covered).toEqual(known);
    expect(ended.effects.slice(1)).toEqual(recorded(known, []));
  });

  test("events that do not fit the phase change nothing", () => {
    expect(run([{ type: "reveal" }, next, { type: "typo" }])).toEqual(run([]));

    const shown = run([answer("jeg snakker ikke norsk")]);

    expect(
      run([answer("jeg snakker ikke norsk"), answer("hei"), { type: "reveal" }])
    ).toEqual(shown);
  });

  test("a finished sentence ignores every event", () => {
    const events = [answer("jeg snakker ikke norsk"), next];

    expect(run([...events, next, { type: "typo" }, answer("hei")])).toEqual(
      run(events)
    );
  });
});
