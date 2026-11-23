// Teaches a small group of words or phrases: each one is shown, then each one is typed from its meaning.
// Showing the whole group first keeps the first recall from being a copy of what is still in mind.
import type { Item, Sentence } from "@norsk/content";

import { gradeCard } from "../grade";
import { exampleFor } from "../select";
import { stay } from "./types";
import type { Step, TaskMachine } from "./types";

export interface IntroInput {
  /** The new items, at least one. */
  items: Item[];
  /** Ids of the items the learner already has. An example that uses any other item is left out. */
  known: ReadonlySet<string>;
}

/**
 * What the learner gets after a miss: a pointer at the article or at the start of the word
 * after the first miss, then the answer to copy.
 */
export type IntroHelp = "none" | "article" | "start" | "copy";

export interface IntroState {
  items: Item[];
  /** One example sentence per item, or null where it has none the learner can read. */
  examples: (Sentence | null)[];
  phase: "show" | "recall";
  index: number;
  /** The item on screen. */
  item: Item;
  /** Its example sentence. */
  example: Sentence | null;
  /** The last answer the learner submitted for this item. */
  typed: string;
  /** Wrong answers for this item so far. */
  misses: number;
  help: IntroHelp;
  /** The item was typed correctly and is now in memory. */
  recalled: boolean;
  /** Earlier items of the group that needed more than one try. */
  missed: number;
  done: boolean;
}

export type IntroEvent =
  | { type: "answer"; text: string }
  /** Ask for the hint without trying first. */
  | { type: "hint" }
  /** "I don't know": see the answer to copy. */
  | { type: "reveal" }
  | { type: "continue" };

/** Moves to the item at `index`, with a clean slate for its recall. */
const goTo = (state: IntroState, index: number): IntroState => {
  const item = state.items[index];

  if (item === undefined) {
    throw new Error(`An intro task has no item ${index}`);
  }

  return {
    ...state,
    example: state.examples[index] ?? null,
    help: "none",
    index,
    item,
    misses: 0,
    recalled: false,
    typed: "",
  };
};

const hear = (state: IntroState): Step<IntroState> => ({
  effects: [{ text: state.item.display, type: "speak" }],
  state,
});

const init = ({ items, known }: IntroInput): Step<IntroState> => {
  const [first] = items;

  if (first === undefined) {
    throw new Error("An intro task needs at least one item");
  }

  const examples = items.map((it) => exampleFor(it, known));

  return hear({
    done: false,
    example: examples[0] ?? null,
    examples,
    help: "none",
    index: 0,
    item: first,
    items,
    missed: 0,
    misses: 0,
    phase: "show",
    recalled: false,
    typed: "",
  });
};

const isLast = (state: IntroState): boolean =>
  state.index + 1 === state.items.length;

/** Step 1: the next item is shown and heard; after the last one, recall starts from the first. */
const show = (state: IntroState): Step<IntroState> =>
  isLast(state)
    ? stay({ ...goTo(state, 0), phase: "recall" })
    : hear(goTo(state, state.index + 1));

const answer = (state: IntroState, text: string): Step<IntroState> => {
  const grade = gradeCard(state.item, text);
  const next = { ...state, typed: text.trim() };

  if (grade.correct) {
    return {
      effects: [
        { ids: [state.item.id], type: "teach" },
        { text: state.item.display, type: "speak" },
      ],
      state: { ...next, recalled: true },
    };
  }

  const hint = grade.wrongArticle ? "article" : "start";

  return stay({
    ...next,
    help: state.misses === 0 ? hint : "copy",
    misses: state.misses + 1,
  });
};

/** Step 2, after a correct answer: the next item, or the end of the task. */
const afterRecall = (state: IntroState): Step<IntroState> => {
  const wrong = state.missed + (state.misses > 0 ? 1 : 0);

  if (!isLast(state)) {
    return stay({ ...goTo(state, state.index + 1), missed: wrong });
  }

  return {
    effects: [
      {
        result: {
          itemIds: state.items.map((it) => it.id),
          right: state.items.length - wrong,
          taught: state.items.length,
          wrong,
        },
        type: "done",
      },
    ],
    state: { ...state, done: true },
  };
};

const step = (state: IntroState, event: IntroEvent): Step<IntroState> => {
  if (state.done) {
    return stay(state);
  }

  if (state.phase === "show") {
    return event.type === "continue" ? show(state) : stay(state);
  }

  if (event.type === "continue") {
    return state.recalled ? afterRecall(state) : stay(state);
  }

  if (state.recalled) {
    return stay(state);
  }

  if (event.type === "answer") {
    return answer(state, event.text);
  }

  // Either kind of help counts as a miss: the item was not recalled unaided.
  if (event.type === "hint") {
    return state.help === "none"
      ? stay({ ...state, help: "start", misses: state.misses + 1 })
      : stay(state);
  }

  return state.help === "copy"
    ? stay(state)
    : stay({ ...state, help: "copy", misses: state.misses + 1 });
};

export const introTask: TaskMachine<IntroInput, IntroState, IntroEvent> = {
  init,
  step,
};
