// A whole sentence: English shown, Norwegian typed. One sentence reviews every taught item in it.
// A miss gets a hint and a second try. The items behind the words missed on the first try fail;
// every other item in the sentence passes.
import type { Sentence, Token } from "@norsk/content";

import { gradeSentence } from "../grade";
import type { SentenceGrade } from "../grade";
import type { ReviewInput } from "../memory";
import { exercised } from "../select";
import { stay } from "./types";
import type { Step, TaskMachine } from "./types";

export interface SentenceInput {
  sentence: Sentence;
  /** Ids of the items the learner already has. Only these are reviewed and named in hints. */
  known: ReadonlySet<string>;
}

/** What the hint points at, without giving the answer. `id` and `pattern` are item ids. */
export type SentenceHint =
  /** All the words are right but their order is not; `pattern` is the word-order rule, if it was taught. */
  | { kind: "order"; pattern: string | null }
  /** Nothing is missing, so there is a word too many. */
  | { kind: "extra" }
  | { kind: "pattern"; id: string }
  | { kind: "word"; id: string }
  | { kind: "chunk"; id: string }
  | { kind: "unknown" };

export type SentencePhase =
  | { step: "ask" }
  | {
      step: "retry";
      first: SentenceGrade;
      hint: SentenceHint;
      /** At most two words are off. */
      close: boolean;
      /** Items that fail whatever the second try brings. */
      failed: string[];
    }
  | {
      step: "result";
      /** The last answer was correct. */
      passed: boolean;
      failed: string[];
      last: SentenceGrade;
    };

export interface SentenceState {
  sentence: Sentence;
  known: ReadonlySet<string>;
  /** The taught items this sentence exercises. */
  covered: string[];
  phase: SentencePhase;
  done: boolean;
}

export type SentenceEvent =
  | { type: "answer"; text: string }
  /** "I don't know": see the answer, before or after a first try. */
  | { type: "reveal" }
  | { type: "continue" }
  /** The learner says the miss was a slip of the fingers: nothing fails. */
  | { type: "typo" };

/** A request for a few words about a mistake, written by a language model. */
export interface ExplainRequest {
  /** "hint" must not give the answer away; "explain" comes after the answer is shown. */
  kind: "hint" | "explain";
  /** The English sentence the learner was asked to say. */
  en: string;
  /** The expected Norwegian. */
  no: string;
  /** What the learner typed. */
  answer: string;
  /** Ids of the items the learner got wrong. */
  itemIds: string[];
}

const itemsOf = (t: Token): string[] => {
  const main = t.w ?? t.c;

  return [...(main === undefined ? [] : [main]), ...(t.p ?? [])];
};

/** Items behind the words the learner got wrong. */
const failedItems = (s: Sentence, g: SentenceGrade): string[] => {
  // Right words in the wrong order: the word-order patterns failed, not the words.
  if (g.orderOnly) {
    return [...new Set(s.patterns)];
  }

  const missed = g.missed.flatMap((i) => s.tokens[i] ?? []);

  return [...new Set(missed.flatMap((t) => itemsOf(t)))];
};

const hintFor = (
  s: Sentence,
  g: SentenceGrade,
  known: ReadonlySet<string>
): SentenceHint => {
  if (g.orderOnly) {
    return {
      kind: "order",
      pattern: s.patterns.find((id) => known.has(id)) ?? null,
    };
  }

  const [firstMissed] = g.missed;

  if (firstMissed === undefined) {
    return { kind: "extra" };
  }

  const token = s.tokens[firstMissed];
  const pattern = token?.p?.find((id) => known.has(id));

  // A known word in the wrong form: the pattern is the better pointer.
  if (
    pattern !== undefined &&
    token?.w !== undefined &&
    g.typed.some((w) => !w.ok)
  ) {
    return { id: pattern, kind: "pattern" };
  }

  if (token?.w !== undefined) {
    return { id: token.w, kind: "word" };
  }

  if (pattern !== undefined) {
    return { id: pattern, kind: "pattern" };
  }

  return token?.c === undefined
    ? { kind: "unknown" }
    : { id: token.c, kind: "chunk" };
};

const init = ({ sentence, known }: SentenceInput): Step<SentenceState> =>
  stay({
    covered: exercised(sentence, known),
    done: false,
    known,
    phase: { step: "ask" },
    sentence,
  });

const showResult = (
  state: SentenceState,
  failed: string[],
  last: SentenceGrade,
  passed: boolean
): Step<SentenceState> => ({
  effects: [{ text: state.sentence.no, type: "speak" }],
  state: { ...state, phase: { failed, last, passed, step: "result" } },
});

const answer = (state: SentenceState, text: string): Step<SentenceState> => {
  const { phase, sentence } = state;
  const grade = gradeSentence(sentence, text);

  if (phase.step === "retry") {
    return showResult(state, phase.failed, grade, grade.correct);
  }

  if (grade.correct) {
    return showResult(state, [], grade, true);
  }

  const off = grade.missed.length + grade.typed.filter((w) => !w.ok).length;

  return stay({
    ...state,
    phase: {
      close: off <= 2,
      failed: failedItems(sentence, grade),
      first: grade,
      hint: hintFor(sentence, grade, state.known),
      step: "retry",
    },
  });
};

const finish = (
  state: SentenceState,
  failed: string[],
  now: number
): Step<SentenceState> => {
  const { covered, sentence } = state;

  const inputs: ReviewInput[] = covered.map((id) => ({
    carrier: true,
    grade: failed.includes(id) ? "again" : "good",
    id,
  }));

  const wrong = inputs.filter((input) => input.grade === "again").length;

  return {
    effects: [
      { inputs, type: "review" },
      { at: now, id: sentence.id, type: "sentenceSeen" },
      {
        result: {
          itemIds: covered,
          right: covered.length - wrong,
          taught: 0,
          wrong,
        },
        type: "done",
      },
    ],
    state: { ...state, done: true },
  };
};

const step = (
  state: SentenceState,
  event: SentenceEvent,
  now: number
): Step<SentenceState> => {
  const { phase } = state;

  if (state.done) {
    return stay(state);
  }

  if (phase.step === "result") {
    if (event.type === "continue") {
      return finish(state, phase.failed, now);
    }

    // A typo needs an answer to have been typed.
    return event.type === "typo" && phase.last.typed.length > 0
      ? finish(state, [], now)
      : stay(state);
  }

  if (event.type === "answer") {
    return answer(state, event.text);
  }

  if (event.type !== "reveal") {
    return stay(state);
  }

  if (phase.step === "retry") {
    return showResult(state, phase.failed, phase.first, false);
  }

  // Giving up before a first try is graded as an empty answer: every word was missed.
  const blank = gradeSentence(state.sentence, "");

  return showResult(state, failedItems(state.sentence, blank), blank, false);
};

export const sentenceTask: TaskMachine<
  SentenceInput,
  SentenceState,
  SentenceEvent
> = { init, step };

const wordsOf = (g: SentenceGrade): string =>
  g.typed.map((w) => w.word).join(" ");

/**
 * What to ask the language model about the state of a sentence task, or null when there is nothing to ask.
 * The machine has already decided right and wrong; the model only adds words about the mistake.
 */
export const explainRequest = (state: SentenceState): ExplainRequest | null => {
  const { phase, sentence } = state;
  const about = { en: sentence.en, no: sentence.no };

  if (phase.step === "retry") {
    return {
      ...about,
      answer: wordsOf(phase.first),
      itemIds: phase.failed,
      kind: "hint",
    };
  }

  // After "I don't know" there is no answer of the learner's to explain.
  if (
    phase.step === "result" &&
    phase.failed.length > 0 &&
    phase.last.typed.length > 0
  ) {
    return {
      ...about,
      answer: wordsOf(phase.last),
      itemIds: phase.failed,
      kind: "explain",
    };
  }

  return null;
};
