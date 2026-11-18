import type { Item, Sentence } from "@norsk/content";

/** Lower-case, no punctuation, single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll(/[.,!?:;"«»()]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export interface SentenceGrade {
  correct: boolean;
  /** One flag per typed word: true if it is in the right place. */
  typed: { word: string; ok: boolean }[];
  /** Indexes of the expected words the learner did not produce. */
  missed: number[];
  /** All the right words, in the wrong order. */
  orderOnly: boolean;
}

/**
 * Compares a typed sentence with the expected one, word by word.
 * Words are aligned by longest common subsequence, so one wrong word
 * does not make the words after it wrong too.
 */
export function gradeSentence(
  sentence: Sentence,
  input: string
): SentenceGrade {
  const typed = normalize(input).split(" ").filter(Boolean);

  if (
    [sentence.no, ...sentence.alts].some(
      (a) => normalize(a) === typed.join(" ")
    )
  ) {
    return {
      correct: true,
      typed: typed.map((word) => ({ word, ok: true })),
      missed: [],
      orderOnly: false,
    };
  }

  const expected = sentence.tokens.map((t) => [
    t.t.toLowerCase(),
    ...(t.alts ?? []),
  ]);

  const same = (i: number, j: number) => expected[i].includes(typed[j]);

  const n = expected.length;
  const m = typed.length;

  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = same(i, j)
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const okTyped = new Array<boolean>(m).fill(false);
  const okExpected = new Array<boolean>(n).fill(false);
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (same(i, j)) {
      okExpected[i] = okTyped[j] = true;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const missed = okExpected.flatMap((ok, k) => (ok ? [] : [k]));
  const correct = missed.length === 0 && okTyped.every(Boolean);

  // Same words, different order: every expected word can be paired with a distinct typed word.
  const pool = [...typed];

  const orderOnly =
    !correct &&
    n === m &&
    expected.every((options) => {
      const k = pool.findIndex((w) => options.includes(w));

      if (k === -1) {
        return false;
      }

      pool.splice(k, 1);

      return true;
    });

  return {
    correct,
    typed: typed.map((word, k) => ({ word, ok: okTyped[k] })),
    missed,
    orderOnly,
  };
}

export interface CardGrade {
  correct: boolean;
  /** The word is right but the en / ei / et in front of it is not. */
  wrongArticle: boolean;
}

export function gradeCard(it: Item, input: string): CardGrade {
  const typed = normalize(input);

  if (it.answers.some((a) => normalize(a) === typed)) {
    return { correct: true, wrongArticle: false };
  }

  const bare = normalize(it.text);
  const words = typed.split(" ");

  const wrongArticle =
    it.pos === "noun" &&
    !!it.gender &&
    it.gender !== "pl" &&
    words.at(-1) === bare;

  return { correct: false, wrongArticle };
}
