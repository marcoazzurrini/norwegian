// Compares what the learner typed with what was expected.
import type { Item, Sentence } from "@norsk/course";

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
  /**
   * Indexes of the expected words that are out of place. Empty unless `orderOnly` is true.
   * Two words that swapped places are both out of place: the answer does not say which one moved.
   */
  misplaced: number[];
}

interface Alignment {
  /** Indexes of the expected words that were matched. */
  expected: Set<number>;
  /** Indexes of the typed words that were matched. */
  typed: Set<number>;
}

type Same = (i: number, j: number) => boolean;

/** `lcs(i, j)` is the length of the longest common subsequence of expected[i..] and typed[j..]. */
const lcsTable = (
  n: number,
  m: number,
  same: Same
): ((i: number, j: number) => number) => {
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

  return lcs;
};

/**
 * Pairs expected words with typed words by longest common subsequence,
 * so one wrong word does not make the words after it wrong too.
 */
const align = (n: number, m: number, same: Same): Alignment => {
  const lcs = lcsTable(n, m, same);
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

/**
 * The expected words that are out of place in an answer that has every word.
 * A word is out of place if the others are in as good an order without it. The pairing of `align`
 * cannot tell this: of two words that swapped places it leaves out one, and which one is chance.
 */
const outOfPlace = (n: number, m: number, same: Same): number[] => {
  const inOrder = lcsTable(n, m, same)(0, 0);
  const all = Array.from({ length: n }, (_, k) => k);

  return all.filter((skip) => {
    const without: Same = (i, j) => same(i < skip ? i : i + 1, j);

    return lcsTable(n - 1, m, without)(0, 0) === inOrder;
  });
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

  if (
    [sentence.target, ...sentence.alts].some((a) => normalize(a) === joined)
  ) {
    return {
      correct: true,
      misplaced: [],
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
  const orderOnly = !correct && sameWords(expected, typed);

  return {
    correct,
    misplaced: orderOnly ? outOfPlace(expected.length, typed.length, same) : [],
    missed,
    orderOnly,
    typed: typed.map((word, k) => ({ ok: matched.typed.has(k), word })),
  };
};

export interface CardGrade {
  correct: boolean;
  /** The word is right but the article in front of it is not. */
  wrongArticle: boolean;
}

export const gradeCard = (it: Item, input: string): CardGrade => {
  const typed = normalize(input);

  if (it.answers.some((a) => normalize(a) === typed)) {
    return { correct: true, wrongArticle: false };
  }

  const wrongArticle =
    it.article !== undefined && typed.split(" ").at(-1) === normalize(it.text);

  return { correct: false, wrongArticle };
};
