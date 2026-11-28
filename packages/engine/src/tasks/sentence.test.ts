import { describe, expect, test } from "bun:test";

import type { Sentence } from "@norsk/course";

import { explainRequest, sentenceTask } from "../index";
import type { Effect, SentenceEvent } from "../index";
import { course, T0, play, sentenceOf } from "../testing";

const { sentenceItems, sentences } = course;

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
const hear = (s: Sentence): Effect => ({ text: s.target, type: "speak" });

const run = (
  events: SentenceEvent[],
  sentence = snakker,
  known: string[] = all
) => play(sentenceTask, { course, known: new Set(known), sentence }, events);

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
      base: snakker.base,
      differences: [{ expected: "norsk", sameWord: null, typed: ["engelsk"] }],
      itemIds: ["w:norsk:adj"],
      kind: "hint",
      orderOnly: false,
      target: snakker.target,
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
    // The explanation is about the try that was wrong: the right one has no mistake in it.
    expect(explainRequest(shown.state)).toMatchObject({
      answer: "jeg snakker ikke engelsk",
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

  test("a known word in the wrong form fails the pattern and not the word, and gets a hint at the pattern", () => {
    const huset = sentenceOf("Huset er stort.");
    const known = ["w:hus:noun", "p:definite", "w:er:verb", "w:stor:adj"];
    const events = [answer("hus er stort")];
    const { state } = run(events, huset, known);

    expect(state.phase).toMatchObject({
      failed: ["p:definite"],
      hint: { id: "p:definite", kind: "pattern" },
      unsure: [],
    });
    // The model still reads the forms of the word, to name the right one.
    expect(explainRequest(state)).toMatchObject({
      differences: [
        { expected: "Huset", sameWord: "w:hus:noun", typed: ["hus"] },
      ],
      itemIds: ["w:hus:noun", "p:definite"],
    });

    // Before the pattern is taught there is nothing but the word to fail.
    const early = known.filter((id) => id !== "p:definite");

    expect(run(events, huset, early).state.phase).toMatchObject({
      failed: ["w:hus:noun", "p:definite"],
      hint: { id: "w:hus:noun", kind: "word" },
    });
  });

  test("a word that is the same for one and for several fails “more than one” in the wrong form", () => {
    const barn = sentenceOf("Vi har tre barn.");
    const known = sentenceItems(barn);

    expect(known).toContain("p:plural");
    expect(
      run([answer("vi har tre barnet")], barn, [...known]).state.phase
    ).toMatchObject({ failed: ["p:plural"], unsure: [] });
  });

  test("a word with an ending it does not have is the right word in the wrong form", () => {
    const rooms = sentenceOf("Huset vårt har fem rom.");
    const come = sentenceOf("Kom hit!");

    expect(
      run([answer("huset vårt har fem romer")], rooms, [
        ...sentenceItems(rooms),
      ]).state.phase
    ).toMatchObject({ failed: ["p:plural"], unsure: [] });
    expect(
      run([answer("komm hit")], come, [...sentenceItems(come)]).state.phase
    ).toMatchObject({ failed: ["p:imperative"], unsure: [] });
  });

  test("a misspelled word fails as a word, and the pattern on it is not reviewed", () => {
    const key = sentenceOf("Hvor er nøkkelen din?");
    const known = [...sentenceItems(key)];
    const events = [answer("hvor er snøkkelen din"), answer(key.target)];
    const shown = run(events, key, known);

    expect(run(events.slice(0, 1), key, known).state.phase).toMatchObject({
      hint: { id: "w:nøkkel:noun", kind: "word" },
    });
    expect(shown.state.phase).toMatchObject({
      failed: ["w:nøkkel:noun"],
      unsure: ["p:definite"],
    });

    const [, review, , done] = run([...events, next], key, known).effects;
    const reviewed = shown.state.covered.filter((id) => id !== "p:definite");

    expect(review).toEqual({
      inputs: reviewed.map((id) => ({
        carrier: true,
        grade: id === "w:nøkkel:noun" ? "again" : "good",
        id,
      })),
      type: "review",
    });
    expect(done).toMatchObject({
      result: { right: reviewed.length - 1, wrong: 1 },
    });
  });

  test("a pattern in doubt on one word still passes when another word shows it right", () => {
    const book = sentenceOf("Boka ligger på bordet.");
    const known = [...sentenceItems(book)];

    expect(
      run([answer("boka ligger på bårdet")], book, known).state.phase
    ).toMatchObject({ failed: ["w:bord:noun"], unsure: [] });
  });

  test("the wrong form of “our” is wrong, and fails “mine and yours”", () => {
    const rooms = sentenceOf("Huset vårt har fem rom.");
    const known = [...sentenceItems(rooms)];

    expect(
      run([answer("huset vår har fem rom")], rooms, known).state.phase
    ).toMatchObject({ failed: ["p:possessive"], step: "retry" });
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

    // Before the pattern is taught there is no rule to name, so the words that are out of place fail.
    const early = run(
      [answer("i dag jeg jobber hjemme")],
      iDag,
      known.filter((id) => id !== "p:v2")
    );

    expect(early.state.covered).not.toContain("p:v2");
    expect(early.state.phase).toMatchObject({
      failed: ["w:jobbe:verb", "p:present", "w:jeg:pron"],
      hint: { kind: "order", pattern: null },
    });
  });

  test("a sentence without a word-order pattern fails the words that are out of place", () => {
    // "snakker" and "ikke" swapped places: nothing says which of the two moved, so both fail.
    const ended = run([
      answer("jeg ikke snakker norsk"),
      answer("jeg snakker ikke norsk"),
      next,
    ]);

    const failed = ["w:snakke:verb", "p:present", "w:ikke:adv", "p:neg"];

    expect(ended.effects).toEqual([hear(snakker), ...recorded(all, failed)]);
  });

  test("a wrong order always fails something the learner has", () => {
    const silent = sentences.filter((s) => {
      const known = new Set(sentenceItems(s));
      const words = s.tokens.map((t) => t.t);

      // Every answer that swaps two neighbouring words.
      return words.slice(1).some((word, k) => {
        const swapped = words.with(k, word).with(k + 1, words[k] ?? "");

        const { phase } = sentenceTask.step(
          sentenceTask.init({ course, known, sentence: s }).state,
          answer(swapped.join(" ")),
          T0
        ).state;

        return (
          phase.step === "retry" &&
          phase.first.orderOnly &&
          !phase.failed.some((id) => known.has(id))
        );
      });
    });

    expect(silent.map((s) => s.target)).toEqual([]);
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

  test("“I don’t know” before a first try shows the answer, and every item is to repeat", () => {
    const shown = run([{ type: "reveal" }]);

    expect(shown.effects).toEqual([hear(snakker)]);
    expect(shown.state.phase).toMatchObject({ passed: false, step: "result" });
    expect(explainRequest(shown.state)).toBeNull();

    // Nothing was typed, so it cannot have been a typo.
    expect(run([{ type: "reveal" }, { type: "typo" }])).toEqual(shown);
    expect(run([{ type: "reveal" }, next]).effects.slice(1)).toEqual(
      recorded(all, all)
    );
  });

  test("events that do not fit the phase change nothing", () => {
    expect(run([next, { type: "typo" }])).toEqual(run([]));

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
