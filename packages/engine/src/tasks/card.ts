// A single item on its own: meaning shown, Norwegian typed.
// One hint and a second try on a miss; only a first-try pass counts as remembered.
import type { Item } from "@norsk/content";

import { gradeCard } from "../grade";
import { stay } from "./types";
import type { Step, TaskMachine } from "./types";

export interface CardInput {
  item: Item;
}

/** What the hint points at: the article in front of the noun, or how the word starts. */
export type CardHint = "article" | "start";

export type CardPhase =
  | { step: "ask" }
  | { step: "retry"; hint: CardHint }
  | { step: "result"; firstTry: boolean; correct: boolean };

export interface CardState {
  item: Item;
  /** The last answer the learner submitted. */
  typed: string;
  phase: CardPhase;
  done: boolean;
}

export type CardEvent =
  | { type: "answer"; text: string }
  /** Give up and see the answer. */
  | { type: "reveal" }
  | { type: "continue" }
  /** The learner says the miss was a slip of the fingers. */
  | { type: "typo" };

const init = ({ item }: CardInput): Step<CardState> =>
  stay({ done: false, item, phase: { step: "ask" }, typed: "" });

const showResult = (
  state: CardState,
  firstTry: boolean,
  correct: boolean
): Step<CardState> => ({
  effects: [{ text: state.item.text, type: "speak" }],
  state: { ...state, phase: { correct, firstTry, step: "result" } },
});

const answer = (state: CardState, text: string): Step<CardState> => {
  const grade = gradeCard(state.item, text);
  const next = { ...state, typed: text.trim() };

  if (state.phase.step === "retry") {
    return showResult(next, false, grade.correct);
  }

  if (grade.correct) {
    return showResult(next, true, true);
  }

  const hint = grade.wrongArticle ? "article" : "start";

  return stay({ ...next, phase: { hint, step: "retry" } });
};

const finish = (state: CardState, good: boolean): Step<CardState> => ({
  effects: [
    {
      inputs: [{ grade: good ? "good" : "again", id: state.item.id }],
      type: "review",
    },
    {
      result: {
        itemIds: [state.item.id],
        right: good ? 1 : 0,
        taught: 0,
        wrong: good ? 0 : 1,
      },
      type: "done",
    },
  ],
  state: { ...state, done: true },
});

const step = (state: CardState, event: CardEvent): Step<CardState> => {
  if (state.done) {
    return stay(state);
  }

  if (state.phase.step === "result") {
    if (event.type === "continue") {
      return finish(state, state.phase.firstTry);
    }

    return event.type === "typo" ? finish(state, true) : stay(state);
  }

  if (event.type === "answer") {
    return answer(state, event.text);
  }

  return event.type === "reveal" && state.phase.step === "retry"
    ? showResult(state, false, false)
    : stay(state);
};

export const cardTask: TaskMachine<CardInput, CardState, CardEvent> = {
  init,
  step,
};
