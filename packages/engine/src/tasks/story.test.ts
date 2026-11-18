import { describe, expect, test } from "bun:test";

import { item, stories, storyById } from "@norsk/content";
import type { Token } from "@norsk/content";

import { storyTask } from "../index";
import type { Effect, StoryEvent } from "../index";
import { must, play } from "../testing";

/** A conversation between Anna and Tom, with two questions. */
const story = must(storyById("st1-0"));
const first = must(story.questions[0]);
const second = must(story.questions[1]);
const next: StoryEvent = { type: "continue" };
const after: StoryEvent = { type: "next" };
const pick = (option: string): StoryEvent => ({ option, type: "pick" });
const right = (index: number) => must(story.questions[index]?.options[0]);

const run = (events: StoryEvent[], told = story) =>
  play(storyTask, { story: told }, events);

/** A word that the story explains by itself, because it is not a taught item. */
const isGlossed = (t: Token): boolean =>
  t.t === "ski" && t.w === undefined && t.c === undefined;

const finished: Effect[] = [
  { id: story.id, type: "storyDone" },
  { result: { itemIds: [], right: 0, taught: 0, wrong: 0 }, type: "done" },
];

describe("a story", () => {
  test("starts with the text, in Norwegian only, and plays nothing by itself", () => {
    expect(run([])).toEqual({
      effects: [],
      state: {
        done: false,
        phase: { step: "read" },
        picked: null,
        showEnglish: false,
        story,
      },
    });
  });

  test("the English can be shown and hidden again", () => {
    expect(run([{ type: "toggleEnglish" }]).state.showEnglish).toBe(true);
    expect(
      run([{ type: "toggleEnglish" }, { type: "toggleEnglish" }]).state
        .showEnglish
    ).toBe(false);
  });

  test("tapping a taught word shows its item", () => {
    const hei = item("c:hei");
    const { effects, state } = run([{ index: 0, line: 0, type: "tapWord" }]);

    expect(state.picked).toEqual({
      index: 0,
      line: 0,
      meaning: { gloss: hei.gloss, item: hei, text: hei.display },
    });
    expect(effects).toEqual([]);
  });

  test("a word inside a phrase shows the word, not the phrase", () => {
    const { state } = run([{ index: 1, line: 0, type: "tapWord" }]);

    expect(state.picked?.meaning?.item?.id).toBe("w:jeg:pron");
  });

  test("tapping a name selects it but has no meaning to show", () => {
    expect(run([{ index: 3, line: 0, type: "tapWord" }]).state.picked).toEqual({
      index: 3,
      line: 0,
      meaning: null,
    });
  });

  test("a word that is not an item shows the story's own gloss", () => {
    const skiing = must(stories.find((st) => st.glosses.ski !== undefined));

    const line = skiing.lines.findIndex((l) => l.tokens.some(isGlossed));
    const index = must(skiing.lines[line]).tokens.findIndex(isGlossed);

    expect(
      run([{ index, line, type: "tapWord" }], skiing).state.picked?.meaning
    ).toEqual({ gloss: "skis", item: null, text: "ski" });
  });

  test("tapping a line plays it", () => {
    expect(run([{ line: 1, type: "hearLine" }]).effects).toEqual([
      { text: must(story.lines[1]).no, type: "speak" },
    ]);
  });

  test("a tap outside the text does nothing", () => {
    expect(
      run([
        { line: 99, type: "hearLine" },
        { index: 99, line: 0, type: "tapWord" },
      ])
    ).toEqual(run([]));
  });

  test("the questions come one at a time; a wrong pick is marked and nothing is recorded", () => {
    const wrong = must(first.options[1]);
    const { effects, state } = run([next, pick(wrong), pick(wrong), after]);

    expect(state.phase).toEqual({
      quiz: { answered: false, index: 0, question: first, wrong: [wrong] },
      step: "questions",
    });
    expect(effects).toEqual([]);
  });

  test("the right pick moves on after the pause", () => {
    expect(run([next, pick(right(0))]).state.phase).toMatchObject({
      quiz: { answered: true, index: 0 },
    });
    expect(run([next, pick(right(0)), after]).state.phase).toEqual({
      quiz: { answered: false, index: 1, question: second, wrong: [] },
      step: "questions",
    });
  });

  test("after the last question the story is marked as read", () => {
    const { effects, state } = run([
      next,
      pick(right(0)),
      after,
      pick(right(1)),
      after,
    ]);

    expect(state.done).toBe(true);
    expect(effects).toEqual(finished);
  });

  test("a story without questions is done as soon as the learner goes on", () => {
    const { effects, state } = run([next], { ...story, questions: [] });

    expect(state.done).toBe(true);
    expect(effects).toEqual(finished);
  });

  test("events that do not fit the phase change nothing", () => {
    expect(run([pick(right(0)), after])).toEqual(run([]));
    expect(
      run([
        next,
        { type: "toggleEnglish" },
        { line: 0, type: "hearLine" },
        next,
      ])
    ).toEqual(run([next]));
  });

  test("a finished story ignores every event", () => {
    const events = [next, pick(right(0)), after, pick(right(1)), after];

    expect(run([...events, after, next, { type: "toggleEnglish" }])).toEqual(
      run(events)
    );
  });
});
