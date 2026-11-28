// A whole sentence: its meaning shown, the sentence typed. One sentence reviews every taught item in it.
// A miss gets a hint and a second try. What fails is read from the first try:
// - a word left out fails with everything on it;
// - a word in the wrong form ("krone" for "kroner", "romer" for "rom") fails the grammar pattern on it,
//   and the word passes;
// - a word that is misspelled or another word fails as a word. Such an answer does not show whether
//   the learner knew the form, so the patterns on it neither fail nor pass.
// Every other item in the sentence passes.
import type { Course, Sentence, Token } from "@norsk/course";

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
  /** The course of the sentence. The forms of its words tell a wrong form from a wrong word. */
  course: Course;
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
      /** Items the first try says nothing about: they are not reviewed. */
      unsure: string[];
    }
  | {
      step: "result";
      /** The last answer was correct. */
      passed: boolean;
      failed: string[];
      /** Items the first try says nothing about: they are not reviewed. */
      unsure: string[];
      last: SentenceGrade;
      /**
       * The answer an explanation is about: the last one that was wrong.
       * After a wrong first try and a right second one, that is the first. Null if no answer was wrong.
       */
      mistake: SentenceGrade | null;
    };

export interface SentenceState {
  sentence: Sentence;
  known: ReadonlySet<string>;
  course: Course;
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

/** One place where the answer differs from the expected sentence. */
export interface Difference {
  /** The expected word. Null for a typed word that belongs nowhere: a word too many. */
  expected: string | null;
  /** What the learner typed in its place. Empty when the word was left out. */
  typed: string[];
  /** The id of the word item, when the learner typed that word in another form. Otherwise null. */
  sameWord: string | null;
}

/** A request for a few words about a mistake, written by a language model. */
export interface ExplainRequest {
  /** "hint" must not give the answer away; "explain" comes after the answer is shown. */
  kind: "hint" | "explain";
  /** The sentence the learner was asked to say, in their own language. */
  base: string;
  /** The expected sentence, in the language of the course. */
  target: string;
  /** What the learner typed. */
  answer: string;
  /** Ids of the taught items behind the words the learner got wrong, whether they fail or not. */
  itemIds: string[];
  /** Where the answer differs, word by word. Empty when only the order is wrong. */
  differences: Difference[];
  /** All the words are right and only their order is wrong. */
  orderOnly: boolean;
}

/** Every item a word of the sentence stands for: the word, the phrase it is part of, and its patterns. */
const itemsOf = (t: Token): string[] =>
  [t.w, t.c, ...(t.p ?? [])].filter((id) => id !== undefined);

const itemsAt = (s: Sentence, indexes: number[]): string[] => [
  ...new Set(indexes.flatMap((i) => s.tokens[i] ?? []).flatMap(itemsOf)),
];

/** The shortest beginning two spellings must share to count as the same word. */
const STEM = 3;

/** True if one spelling is the beginning of the other: "rom" and "romer", "komm" and "komme". */
const sameStem = (one: string, other: string): boolean =>
  Math.min(one.length, other.length) >= STEM &&
  (one.startsWith(other) || other.startsWith(one));

/**
 * True if one of the typed words is the word of this token in another form: "krone" for "kroner".
 * A form the word does not have counts too, when it is the word with another ending: "romer" for
 * "rom" shows that the learner knew the word and got its form wrong.
 */
const isSameWord = (course: Course, token: Token, typed: string[]): boolean => {
  if (token.w === undefined) {
    return false;
  }

  const { forms, text } = course.item(token.w);
  const word = text.toLowerCase();

  const spellings = new Set([
    word,
    ...(forms ?? []).map(({ form }) => form.toLowerCase()),
  ]);

  return typed.some((one) => spellings.has(one) || sameStem(one, word));
};

/** What a wrong answer says about the items of a sentence. */
interface Blame {
  failed: string[];
  /** Items the answer says nothing about. */
  unsure: string[];
}

/** What a missed word says about its items. `typed` is what the learner wrote in its place. */
const blameWord = (
  { course, known }: SentenceInput,
  token: Token,
  typed: string[]
): Blame => {
  const everything = { failed: itemsOf(token), unsure: [] };
  const patterns = token.p ?? [];
  const taughtPatterns = patterns.filter((id) => known.has(id));

  if (typed.length === 0) {
    return everything;
  }

  // The right word in the wrong form: the learner knows the word, and the grammar went wrong.
  // With no taught pattern to blame, the word fails: a wrong answer must fail something.
  if (isSameWord(course, token, typed)) {
    return taughtPatterns.length > 0
      ? { failed: taughtPatterns, unsure: [] }
      : everything;
  }

  const word = [token.w, token.c].filter((id) => id !== undefined);

  return word.some((id) => known.has(id))
    ? { failed: word, unsure: patterns }
    : everything;
};

/**
 * What the first try says about the items of the sentence.
 * Right words in the wrong order: the word-order patterns failed, not the words. A sentence
 * that has no taught pattern for its order has no rule to blame, so the words that are out of
 * place fail. A wrong answer that failed nothing would be recorded as a recall.
 */
const blame = (input: SentenceInput, g: SentenceGrade): Blame => {
  const { known, sentence } = input;

  if (g.orderOnly) {
    const rules = [...new Set(sentence.patterns)].filter((id) => known.has(id));

    return {
      failed: rules.length > 0 ? rules : itemsAt(sentence, g.misplaced),
      unsure: [],
    };
  }

  const words = g.missed.map((at, k) => {
    const token = sentence.tokens[at];

    return token === undefined
      ? { failed: [], unsure: [] }
      : blameWord(input, token, g.instead[k] ?? []);
  });

  const failed = [...new Set(words.flatMap((word) => word.failed))];

  // A pattern that another word of the answer shows right is not in doubt.
  const shown = new Set(
    itemsAt(
      sentence,
      sentence.tokens.flatMap((_, at) => (g.missed.includes(at) ? [] : [at]))
    )
  );

  return {
    failed,
    unsure: [...new Set(words.flatMap((word) => word.unsure))].filter(
      (id) => !failed.includes(id) && !shown.has(id)
    ),
  };
};

const hintFor = (input: SentenceInput, g: SentenceGrade): SentenceHint => {
  const { course, known, sentence: s } = input;

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
    token !== undefined &&
    isSameWord(course, token, g.instead[0] ?? [])
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

const init = ({
  sentence,
  known,
  course,
}: SentenceInput): Step<SentenceState> =>
  stay({
    course,
    covered: exercised(sentence, known),
    done: false,
    known,
    phase: { step: "ask" },
    sentence,
  });

const showResult = (
  state: SentenceState,
  { failed, unsure }: Blame,
  last: SentenceGrade,
  mistake: SentenceGrade | null
): Step<SentenceState> => ({
  effects: [{ text: state.sentence.target, type: "speak" }],
  state: {
    ...state,
    phase: {
      failed,
      last,
      mistake,
      passed: last.correct,
      step: "result",
      unsure,
    },
  },
});

const NOTHING: Blame = { failed: [], unsure: [] };

const answer = (state: SentenceState, text: string): Step<SentenceState> => {
  const { phase, sentence } = state;
  const grade = gradeSentence(sentence, text);

  if (phase.step === "retry") {
    return showResult(state, phase, grade, grade.correct ? phase.first : grade);
  }

  if (grade.correct) {
    return showResult(state, NOTHING, grade, null);
  }

  const off = grade.missed.length + grade.typed.filter((w) => !w.ok).length;

  return stay({
    ...state,
    phase: {
      ...blame(state, grade),
      close: off <= 2,
      first: grade,
      hint: hintFor(state, grade),
      step: "retry",
    },
  });
};

const finish = (
  state: SentenceState,
  { failed, unsure }: Blame,
  now: number
): Step<SentenceState> => {
  const { covered, sentence } = state;

  const inputs: ReviewInput[] = covered
    .filter((id) => !unsure.includes(id))
    .map((id) => ({
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
          right: inputs.length - wrong,
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
      return finish(state, phase, now);
    }

    // A typo needs an answer to have been typed.
    return event.type === "typo" && phase.last.typed.length > 0
      ? finish(state, NOTHING, now)
      : stay(state);
  }

  if (event.type === "answer") {
    return answer(state, event.text);
  }

  if (event.type !== "reveal") {
    return stay(state);
  }

  if (phase.step === "retry") {
    return showResult(state, phase, phase.first, phase.first);
  }

  // Giving up before a first try is graded as an empty answer: every word was missed.
  const blank = gradeSentence(state.sentence, "");

  return showResult(state, blame(state, blank), blank, null);
};

export const sentenceTask: TaskMachine<
  SentenceInput,
  SentenceState,
  SentenceEvent
> = { init, step };

const wordsOf = (g: SentenceGrade): string =>
  g.typed.map((w) => w.word).join(" ");

/** Where an answer differs from the expected sentence, word by word. */
const differencesOf = (
  { course, sentence }: SentenceState,
  g: SentenceGrade
): Difference[] => {
  if (g.orderOnly) {
    return [];
  }

  const missed = g.missed.flatMap((at, k): Difference[] => {
    const token = sentence.tokens[at];
    const typed = g.instead[k] ?? [];

    if (token === undefined) {
      return [];
    }

    const same = isSameWord(course, token, typed) ? token.w : undefined;

    return [{ expected: token.t, sameWord: same ?? null, typed }];
  });

  return [
    ...missed,
    ...g.extra.map((word) => ({
      expected: null,
      sameWord: null,
      typed: [word],
    })),
  ];
};

/** The wrong answer to ask about, or null when there is none. */
const asked = (phase: SentencePhase) => {
  if (phase.step === "retry") {
    return {
      failed: phase.failed,
      kind: "hint",
      mistake: phase.first,
    } as const;
  }

  // After "I don't know" there is no answer of the learner's to explain. After a wrong try and
  // a right one, the wrong one is explained: the right one has no mistake in it.
  return phase.step === "result" &&
    phase.failed.length > 0 &&
    phase.mistake !== null
    ? ({
        failed: phase.failed,
        kind: "explain",
        mistake: phase.mistake,
      } as const)
    : null;
};

/**
 * What to ask the language model about the state of a sentence task, or null when there is nothing to ask.
 * The machine has already decided right and wrong; the model only adds words about the mistake.
 */
export const explainRequest = (state: SentenceState): ExplainRequest | null => {
  const { known, phase, sentence } = state;
  const about = asked(phase);

  if (about === null) {
    return null;
  }

  const { failed, kind, mistake } = about;

  return {
    answer: wordsOf(mistake),
    base: sentence.base,
    differences: differencesOf(state, mistake),
    // The model reads what the course teaches about these. A word in the wrong form does not
    // fail, but its forms are what the model needs to name the right one.
    itemIds: mistake.orderOnly
      ? failed
      : itemsAt(sentence, mistake.missed).filter((id) => known.has(id)),
    kind,
    orderOnly: mistake.orderOnly,
    target: sentence.target,
  };
};
