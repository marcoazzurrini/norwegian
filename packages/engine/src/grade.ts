// Compares what the learner typed with what was expected.
import type { Item, Sentence } from "@norsk/content";

/** Lower-case, no punctuation, single spaces. */
const normalize = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[.,!?:;"«»()]/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

export interface TypedWord {
  word: string;
  /** True if the word is in the right place. */
  ok: boolean;
}

export interface SentenceGrade {
  correct: boolean;
  /** The words the learner typed, each marked right or wrong. */
  typed: TypedWord[];
  /** Indexes of the expected words the learner did not produce. */
  missed: number[];
  /** All the right words, in the wrong order. */
  orderOnly: boolean;
}

interface Alignment {
  /** Indexes of the expected words that were matched. */
  expected: Set<number>;
  /** Indexes of the typed words that were matched. */
  typed: Set<number>;
}

/**
 * Pairs expected words with typed words by longest common subsequence,
 * so one wrong word does not make the words after it wrong too.
 */
const align = (
  n: number,
  m: number,
  same: (i: number, j: number) => boolean
): Alignment => {
  // lcs(i, j) is the length of the longest common subsequence of expected[i..] and typed[j..].
  const width = m + 1;
  const table = Array.from({ length: (n + 1) * width }, () => 0);
  const lcs = (i: number, j: number): number => table[i * width + j] ?? 0;

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = same(i, j)
        ? lcs(i + 1, j + 1) + 1
        : Math.max(lcs(i + 1, j), lcs(i, j + 1));
    }
  }

  const matched: Alignment = { expected: new Set(), typed: new Set() };
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (same(i, j)) {
      matched.expected.add(i);
      matched.typed.add(j);
      i += 1;
      j += 1;
    } else if (lcs(i + 1, j) >= lcs(i, j + 1)) {
      i += 1;
    } else {
      j += 1;
    }
  }

  return matched;
};

/** Same words, different order: every expected word can be paired with a distinct typed word. */
const sameWords = (expected: string[][], typed: string[]): boolean => {
  if (expected.length !== typed.length) {
    return false;
  }

  const pool = [...typed];

  return expected.every((options) => {
    const k = pool.findIndex((w) => options.includes(w));

    if (k === -1) {
      return false;
    }

    pool.splice(k, 1);

    return true;
  });
};

/** Compares a typed sentence with the expected one, word by word. */
export const gradeSentence = (
  sentence: Sentence,
  input: string
): SentenceGrade => {
  const typed = normalize(input).split(" ").filter(Boolean);
  const joined = typed.join(" ");

  if ([sentence.no, ...sentence.alts].some((a) => normalize(a) === joined)) {
    return {
      correct: true,
      missed: [],
      orderOnly: false,
      typed: typed.map((word) => ({ ok: true, word })),
    };
  }

  const expected = sentence.tokens.map((t) => [
    t.t.toLowerCase(),
    ...(t.alts ?? []),
  ]);

  const same = (i: number, j: number): boolean => {
    const options = expected[i];
    const word = typed[j];

    return (
      options !== undefined && word !== undefined && options.includes(word)
    );
  };

  const matched = align(expected.length, typed.length, same);

  const missed = expected.flatMap((_, k) =>
    matched.expected.has(k) ? [] : [k]
  );

  const correct = missed.length === 0 && matched.typed.size === typed.length;

  return {
    correct,
    missed,
    orderOnly: !correct && sameWords(expected, typed),
    typed: typed.map((word, k) => ({ ok: matched.typed.has(k), word })),
  };
};

export interface CardGrade {
  correct: boolean;
  /** The word is right but the en / ei / et in front of it is not. */
  wrongArticle: boolean;
}

export const gradeCard = (it: Item, input: string): CardGrade => {
  const typed = normalize(input);

  if (it.answers.some((a) => normalize(a) === typed)) {
    return { correct: true, wrongArticle: false };
  }

  const wrongArticle =
    it.pos === "noun" &&
    it.gender !== undefined &&
    it.gender !== "pl" &&
    typed.split(" ").at(-1) === normalize(it.text);

  return { correct: false, wrongArticle };
};
