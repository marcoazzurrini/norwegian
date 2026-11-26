// Teaches a grammar pattern: contrasting examples and a short rule, reading questions, then typed sentences.
// The pattern counts as taught once the reading questions are answered; the sentences then review it.
import type { Item, Quiz, Sentence } from "@norsk/course";

import { askQuestion, pickOption } from "./quiz";
import type { QuizState } from "./quiz";
import { sentenceTask } from "./sentence";
import type { SentenceEvent, SentenceState } from "./sentence";
import { stay } from "./types";
import type { Effect, Step, TaskMachine, TaskResult } from "./types";

export interface PatternInput {
  /** The pattern to teach. */
  item: Item;
  /** Sentences that use the pattern and only taught words. May be empty. */
  practice: Sentence[];
  /** Ids of the items the learner already has. */
  known: ReadonlySet<string>;
}

export type PatternPhase =
  /** Step 1: the examples and the rule. */
  | { step: "see" }
  /** Step 2: reading questions. */
  | { step: "read"; quiz: QuizState }
  /** Step 3: one practice sentence at a time. */
  | { step: "produce"; index: number; sentence: SentenceState };

export interface PatternState {
  item: Item;
  quiz: Quiz[];
  practice: Sentence[];
  /** What the learner has once the pattern is taught: the input's known items plus the pattern. */
  known: ReadonlySet<string>;
  /** How many steps the task has: the third one needs practice sentences. */
  steps: 2 | 3;
  phase: PatternPhase;
  /** The pattern itself, plus the counts of the practice sentences finished so far. */
  result: TaskResult;
  done: boolean;
}

export type PatternEvent =
  | SentenceEvent
  /** An option of a reading question was picked. */
  | { type: "pick"; option: string }
  /** The pause after a right pick is over. */
  | { type: "next" };

const init = ({ item, known, practice }: PatternInput): Step<PatternState> =>
  stay({
    done: false,
    item,
    known: new Set([...known, item.id]),
    phase: { step: "see" },
    practice,
    quiz: item.quiz ?? [],
    result: { itemIds: [item.id], right: 0, taught: 1, wrong: 0 },
    steps: practice.length > 0 ? 3 : 2,
  });

const finish = (
  state: PatternState,
  effects: Effect[]
): Step<PatternState> => ({
  effects: [...effects, { result: state.result, type: "done" }],
  state: { ...state, done: true },
});

/** Starts the practice sentence at `index`, or ends the task when there is none. */
const produce = (
  state: PatternState,
  index: number,
  effects: Effect[]
): Step<PatternState> => {
  const sentence = state.practice[index];

  if (sentence === undefined) {
    return finish(state, effects);
  }

  const first = sentenceTask.init({ known: state.known, sentence });

  return {
    effects: [...effects, ...first.effects],
    state: {
      ...state,
      phase: { index, sentence: first.state, step: "produce" },
    },
  };
};

/** Shows the reading question at `index`. After the last one the pattern is taught. */
const read = (state: PatternState, index: number): Step<PatternState> => {
  const quiz = askQuestion(state.quiz, index);

  return quiz === null
    ? produce(state, 0, [{ ids: [state.item.id], type: "teach" }])
    : stay({ ...state, phase: { quiz, step: "read" } });
};

/** Passes an event to the practice sentence and moves on when that sentence is done. */
const practise = (
  state: PatternState,
  phase: Extract<PatternPhase, { step: "produce" }>,
  event: SentenceEvent,
  now: number
): Step<PatternState> => {
  const inner = sentenceTask.step(phase.sentence, event, now);
  const effects = inner.effects.filter((effect) => effect.type !== "done");
  const finished = inner.effects.find((effect) => effect.type === "done");

  if (finished === undefined) {
    return {
      effects,
      state: { ...state, phase: { ...phase, sentence: inner.state } },
    };
  }

  const result = {
    ...state.result,
    right: state.result.right + finished.result.right,
    wrong: state.result.wrong + finished.result.wrong,
  };

  return produce({ ...state, result }, phase.index + 1, effects);
};

const step = (
  state: PatternState,
  event: PatternEvent,
  now: number
): Step<PatternState> => {
  const { phase } = state;

  if (state.done) {
    return stay(state);
  }

  if (event.type === "pick") {
    return phase.step === "read"
      ? stay({
          ...state,
          phase: { ...phase, quiz: pickOption(phase.quiz, event.option) },
        })
      : stay(state);
  }

  if (event.type === "next") {
    return phase.step === "read" && phase.quiz.answered
      ? read(state, phase.quiz.index + 1)
      : stay(state);
  }

  if (phase.step === "produce") {
    return practise(state, phase, event, now);
  }

  return phase.step === "see" && event.type === "continue"
    ? read(state, 0)
    : stay(state);
};

export const patternTask: TaskMachine<
  PatternInput,
  PatternState,
  PatternEvent
> = { init, step };
