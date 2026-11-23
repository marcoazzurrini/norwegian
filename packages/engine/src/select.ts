// Decides what the learner can do next: which sentences are usable, which items are due,
// and which review clears the most due items at once ("compression").
import {
  chunkCovered,
  exampleOf,
  item,
  items,
  lessons,
  sentenceItems,
  sentenceReady,
  sentences,
  sentencesWith,
  stories,
} from "@norsk/content";
import type { Item, Known, Lesson, Sentence, Story } from "@norsk/content";

import {
  CARRIER_MIN_DAYS,
  dueTime,
  isDue,
  isLearning,
  isStable,
} from "./memory";
import type { Mem } from "./memory";

export type Memory = ReadonlyMap<string, Mem>;

export type ItemState = "locked" | "ready" | "learning" | "stable";

export type LessonState = "locked" | "ready" | "started" | "done";

const lessonAt = (index: number): Lesson => {
  const found = lessons[index];

  if (found === undefined) {
    throw new Error(`Unknown lesson ${index}`);
  }

  return found;
};

/** A story is readable once its words are taught. Grammar is not required for reading. */
export const storyReady = (st: Story, known: Known): boolean =>
  st.lines.every((l) =>
    l.tokens.every(
      (t) => chunkCovered(t, known) || t.w === undefined || known.has(t.w)
    )
  );

/** The taught items a sentence exercises. */
export const exercised = (s: Sentence, known: Known): string[] =>
  sentenceItems(s).filter((id) => known.has(id));

export const lessonState = (l: Lesson, known: Known): LessonState => {
  const taught = l.items.filter((id) => known.has(id)).length;

  if (taught === l.items.length) {
    return "done";
  }

  if (taught > 0) {
    return "started";
  }

  return l.needs.every((n) => lessonState(lessonAt(n), known) === "done")
    ? "ready"
    : "locked";
};

export const itemState = (it: Item, mem: Memory): ItemState => {
  const m = mem.get(it.id);

  if (m !== undefined) {
    return isStable(m) ? "stable" : "learning";
  }

  const state = lessonState(lessonAt(it.lesson), mem);

  return state === "ready" || state === "started" ? "ready" : "locked";
};

/** The lesson to teach next: the one in progress, else the chosen one, else the earliest ready one. */
export const nextLesson = (
  mem: Memory,
  chosen: number | null = null
): Lesson | null => {
  const started = lessons.find((l) => lessonState(l, mem) === "started");

  if (started !== undefined) {
    return started;
  }

  const picked = chosen === null ? undefined : lessons[chosen];

  if (picked !== undefined && lessonState(picked, mem) === "ready") {
    return picked;
  }

  return lessons.find((l) => lessonState(l, mem) === "ready") ?? null;
};

/**
 * How much new material is shown together before the learner types it back.
 * A word costs one. A phrase costs one for every word in it the learner has not met,
 * and a long phrase costs two at least.
 */
const INTRO_LOAD = 3;

/** A phrase of this many words is long. */
const LONG_PHRASE = 3;

/** The words taught on their own, by every form they are written in. */
const wordItems = new Map<string, string[]>();

for (const it of Object.values(items)) {
  if (it.kind === "word") {
    for (const form of [it.text, ...(it.forms ?? []).map((row) => row.form)]) {
      const key = form.toLowerCase();

      wordItems.set(key, [...(wordItems.get(key) ?? []), it.id]);
    }
  }
}

/** The words of a phrase, without the gap of a phrase such as "jeg heter ___" and without punctuation. */
const wordsOf = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** How much a new item asks of the learner. A long phrase of unknown words asks more than a word. */
const loadOf = (it: Item, known: Known): number => {
  if (it.kind !== "chunk") {
    return 1;
  }

  const words = wordsOf(it.text);

  const unknown = words.filter(
    (word) => !(wordItems.get(word) ?? []).some((id) => known.has(id))
  );

  // Known words still have to be kept in order, so a long phrase never counts as a single word.
  return Math.max(words.length >= LONG_PHRASE ? 2 : 1, unknown.length);
};

/**
 * The next new material of a lesson: one pattern, or a small group of words and phrases.
 * A group puts other items between seeing a word and typing it, so the first recall
 * comes from memory and is not a copy of what is still in mind. The group stops before
 * it asks too much at once, so a long phrase is taught alone.
 */
export const nextNewItems = (l: Lesson, mem: Memory): Item[] => {
  const waiting = l.items.filter((id) => !mem.has(id)).map((id) => item(id));
  const [first] = waiting;

  if (first === undefined || first.kind === "pattern") {
    return waiting.slice(0, 1);
  }

  const group = [first];
  let load = loadOf(first, mem);

  for (const next of waiting.slice(1)) {
    load += loadOf(next, mem);

    if (next.kind === "pattern" || load > INTRO_LOAD) {
      break;
    }

    group.push(next);
  }

  return group;
};

export interface Due {
  /** Items in their first minutes of learning, or relearning after a miss. */
  learning: Mem[];
  /** Items whose scheduled review has arrived. */
  review: Mem[];
}

export const byDue = (a: Mem, b: Mem): number => dueTime(a) - dueTime(b);

export const dueItems = (mem: Memory, now: number): Due => {
  const due = [...mem.values()].filter((m) => isDue(m, now)).toSorted(byDue);

  return {
    learning: due.filter((m) => isLearning(m)),
    review: due.filter((m) => !isLearning(m)),
  };
};

const isPattern = (id: string): boolean => item(id).kind === "pattern";

/** An item is reviewed inside sentences once it is past its first days. Patterns can only be reviewed that way. */
const usesCarrier = (m: Mem): boolean =>
  isPattern(m.id) || m.card.stability >= CARRIER_MIN_DAYS;

export type ReviewPick =
  | { type: "sentence"; sentence: Sentence; covers: string[] }
  | { type: "card"; item: Item };

interface Cover {
  sentence: Sentence;
  covers: string[];
  score: number;
}

/** The unused sentence that scores highest among those that clear at least one wanted item. */
const bestCover = (
  mem: Memory,
  wanted: ReadonlySet<string>,
  skipSentences: ReadonlySet<string>,
  scoreOf: (covers: string[], sentence: Sentence) => number
): Cover | null => {
  let best: Cover | null = null;

  if (wanted.size === 0) {
    return best;
  }

  for (const sentence of sentences) {
    if (!skipSentences.has(sentence.id)) {
      // Every wanted item is in memory, so these are the taught items the sentence clears.
      // Most sentences clear none, and that is cheaper to find out than whether one is usable.
      const covers = sentenceItems(sentence).filter((id) => wanted.has(id));

      if (covers.length > 0 && sentenceReady(sentence, mem)) {
        const score = scoreOf(covers, sentence);

        if (best === null || score > best.score) {
          best = { covers, score, sentence };
        }
      }
    }
  }

  return best;
};

/**
 * Picks the next review. Prefers the sentence that clears the most due items;
 * falls back to a single card for an item no sentence can cover.
 */
export const pickReview = (
  mem: Memory,
  now: number,
  skipSentences: ReadonlySet<string>,
  skipItems: ReadonlySet<string> = new Set()
): ReviewPick | null => {
  const due = dueItems(mem, now).review.filter((m) => !skipItems.has(m.id));
  const wanted = new Set(due.filter((m) => usesCarrier(m)).map((m) => m.id));

  // More due items first; among equals, the shorter sentence.
  const best = bestCover(
    mem,
    wanted,
    skipSentences,
    (covers, sentence) => covers.length - sentence.tokens.length * 0.04
  );

  if (best !== null) {
    return { covers: best.covers, sentence: best.sentence, type: "sentence" };
  }

  const single = due.find((m) => !isPattern(m.id));

  return single === undefined ? null : { item: item(single.id), type: "card" };
};

export interface Compression {
  /** Items due for review now. */
  due: number;
  /** Reviews it would take to clear them. */
  tasks: number;
}

/** How many sentence reviews would clear everything that is due now. Used for the Today screen. */
export const compression = (mem: Memory, now: number): Compression => {
  const due = dueItems(mem, now).review;
  const carried = new Set(due.filter((m) => usesCarrier(m)).map((m) => m.id));
  const left = new Set(due.map((m) => m.id));
  const used = new Set<string>();
  let tasks = 0;

  while (left.size > 0) {
    const wanted = new Set([...left].filter((id) => carried.has(id)));
    const best = bestCover(mem, wanted, used, (covers) => covers.length);

    if (best === null) {
      const next = [...left].find((id) => !isPattern(id));

      if (next === undefined) {
        break;
      }

      left.delete(next);
    } else {
      used.add(best.sentence.id);

      for (const id of best.covers) {
        left.delete(id);
      }
    }

    tasks += 1;
  }

  return { due: due.length, tasks };
};

/** Sentences that practise a pattern and use only taught words, shortest first. */
export const practiceFor = (
  patternId: string,
  known: Known,
  limit: number
): Sentence[] => {
  const withPattern: Known = {
    has: (id) => id === patternId || known.has(id),
  };

  return sentencesWith(patternId)
    .filter((s) => sentenceReady(s, withPattern))
    .toSorted((a, b) => a.tokens.length - b.tokens.length)
    .slice(0, limit);
};

/**
 * The example sentence of a new item. It is chosen when the curriculum is built, for a learner who
 * takes the lessons in course order. A learner who took a later lesson first may not have met one of
 * its words yet: the example is then left out.
 */
export const exampleFor = (it: Item, known: Known): Sentence | null => {
  const example = exampleOf(it);
  const withItem: Known = { has: (id) => id === it.id || known.has(id) };

  return example !== null && sentenceReady(example, withItem) ? example : null;
};

export const nextStory = (
  mem: Memory,
  done: ReadonlySet<string>
): Story | null =>
  stories.find((st) => !done.has(st.id) && storyReady(st, mem)) ?? null;
