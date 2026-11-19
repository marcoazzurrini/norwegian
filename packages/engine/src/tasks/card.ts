// A single item on its own: meaning shown, Norwegian typed.
// A miss gets one hint and a second try. A second miss, or "I don't know", shows the answer,
// which the learner copies once. Only a first-try pass without a hint counts as remembered.
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
  /** The answer is on screen and the learner types it once. */
  | { step: "copy"; answered: boolean }
  | {
      step: "result";
      firstTry: boolean;
      correct: boolean;
      /** The learner typed an answer of their own, so the miss can have been a typo. */
      answered: boolean;
    };

export interface CardState {
  item: Item;
  /** The last answer the learner submitted. */
  typed: string;
  phase: CardPhase;
  done: boolean;
}

export type CardEvent =
  | { type: "answer"; text: string }
  /** Ask for the hint without trying first. */
  | { type: "hint" }
  /** "I don't know": see the answer, at any point before the result. */
  | { type: "reveal" }
  | { type: "continue" }
  /** The learner says the miss was a slip of the fingers. */
  | { type: "typo" };

const init = ({ item }: CardInput): Step<CardState> =>
  stay({ done: false, item, phase: { step: "ask" }, typed: "" });

const showResult = (
  state: CardState,
  firstTry: boolean,
  correct: boolean,
  answered: boolean
): Step<CardState> => ({
  effects: [{ text: state.item.display, type: "speak" }],
  state: {
    ...state,
    phase: { answered, correct, firstTry, step: "result" },
  },
});

const showAnswer = (state: CardState, answered: boolean): Step<CardState> =>
  stay({ ...state, phase: { answered, step: "copy" } });

const answer = (state: CardState, text: string): Step<CardState> => {
  const { phase } = state;
  const grade = gradeCard(state.item, text);
  const next = { ...state, typed: text.trim() };

  if (phase.step === "copy") {
    return grade.correct
      ? showResult(next, false, false, phase.answered)
      : stay(next);
  }

  if (phase.step === "retry") {
    return grade.correct
      ? showResult(next, false, true, true)
      : showAnswer(next, true);
  }

  if (grade.correct) {
    return showResult(next, true, true, true);
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
  const { phase } = state;

  if (state.done) {
    return stay(state);
  }

  if (phase.step === "result") {
    if (event.type === "continue") {
      return finish(state, phase.firstTry);
    }

    return event.type === "typo" && phase.answered
      ? finish(state, true)
      : stay(state);
  }

  if (event.type === "answer") {
    return answer(state, event.text);
  }

  if (event.type === "hint" && phase.step === "ask") {
    return stay({ ...state, phase: { hint: "start", step: "retry" } });
  }

  // Asking for the answer after a try of their own leaves room for "it was a typo".
  return event.type === "reveal" && phase.step !== "copy"
    ? showAnswer(state, state.typed !== "")
    : stay(state);
};

export const cardTask: TaskMachine<CardInput, CardState, CardEvent> = {
  init,
  step,
};
