// Decides what the learner can do next: which sentences are usable, which items are due,
// and which review clears the most due items at once ("compression").
// Every question is asked of one course, which the caller passes in.
import { chunkCovered, itemsOfSentence, sentenceReady } from "@norsk/course";
import type {
  Course,
  Item,
  Known,
  Lesson,
  Level,
  Sentence,
  Story,
} from "@norsk/course";

import { dueTime, isDue, isLearning, isStable } from "./memory";
import type { Mem } from "./memory";

export type Memory = ReadonlyMap<string, Mem>;

export type ItemState = "locked" | "ready" | "learning" | "stable";

export type LessonState = "locked" | "ready" | "started" | "done";

export type LevelState = "locked" | "open" | "done";

const lessonAt = (course: Course, index: number): Lesson => {
  const found = course.lessons[index];

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
  itemsOfSentence(s).filter((id) => known.has(id));

export const lessonState = (
  course: Course,
  l: Lesson,
  known: Known
): LessonState => {
  const taught = l.items.filter((id) => known.has(id)).length;

  if (taught === l.items.length) {
    return "done";
  }

  if (taught > 0) {
    return "started";
  }

  return l.needs.every(
    (n) => lessonState(course, lessonAt(course, n), known) === "done"
  )
    ? "ready"
    : "locked";
};

const everyLessonDone = (course: Course, one: Level, known: Known): boolean => {
  const all = course.levelLessons(one);

  return (
    all.length > 0 && all.every((l) => lessonState(course, l, known) === "done")
  );
};

/**
 * A level opens when the level before it is done. A level that is not written yet has
 * no lessons, so it stays locked.
 */
export const levelState = (
  course: Course,
  one: Level,
  known: Known
): LevelState => {
  if (everyLessonDone(course, one, known)) {
    return "done";
  }

  const before = course.levels[course.levels.indexOf(one) - 1];

  const reached =
    before === undefined || everyLessonDone(course, before, known);

  return reached && course.levelLessons(one).length > 0 ? "open" : "locked";
};

/** The level the learner is in: the first one that is open, or the last one done when none is. */
export const currentLevel = (course: Course, known: Known): Level => {
  const found =
    course.levels.find((one) => levelState(course, one, known) === "open") ??
    course.levels.findLast(
      (one) => levelState(course, one, known) === "done"
    ) ??
    course.levels[0];

  if (found === undefined) {
    throw new Error("The course has no level");
  }

  return found;
};

export const itemState = (course: Course, it: Item, mem: Memory): ItemState => {
  const m = mem.get(it.id);

  if (m !== undefined) {
    return isStable(m) ? "stable" : "learning";
  }

  const state = lessonState(course, lessonAt(course, it.lesson), mem);

  return state === "ready" || state === "started" ? "ready" : "locked";
};

/** The lesson to teach next: the one in progress, else the chosen one, else the earliest ready one. */
export const nextLesson = (
  course: Course,
  mem: Memory,
  chosen: number | null = null
): Lesson | null => {
  const started = course.lessons.find(
    (l) => lessonState(course, l, mem) === "started"
  );

  if (started !== undefined) {
    return started;
  }

  const picked = chosen === null ? undefined : course.lessons[chosen];

  if (picked !== undefined && lessonState(course, picked, mem) === "ready") {
    return picked;
  }

  return (
    course.lessons.find((l) => lessonState(course, l, mem) === "ready") ?? null
  );
};

/**
 * How much new material is shown together before the learner types it back.
 * A word costs one. A phrase costs one for every word in it the learner has not met,
 * and a long phrase costs two at least.
 */
const INTRO_LOAD = 3;

/** A phrase of this many words is long. */
const LONG_PHRASE = 3;

/** For each course, the words taught on their own, by every form they are written in. */
const wordItemsByCourse = new WeakMap<Course, Map<string, string[]>>();

// A course never changes while the app runs, so its words are listed once.
const wordItemsOf = (course: Course): Map<string, string[]> => {
  const known = wordItemsByCourse.get(course);

  if (known !== undefined) {
    return known;
  }

  const wordItems = new Map<string, string[]>();

  for (const it of Object.values(course.items)) {
    if (it.kind === "word") {
      for (const form of [
        it.text,
        ...(it.forms ?? []).map((row) => row.form),
      ]) {
        const key = form.toLowerCase();

        wordItems.set(key, [...(wordItems.get(key) ?? []), it.id]);
      }
    }
  }

  wordItemsByCourse.set(course, wordItems);

  return wordItems;
};

/** The words of a phrase, without the gap of a phrase such as "jeg heter ___" and without punctuation. */
const wordsOf = (phrase: string): string[] =>
  phrase
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

/** How much a new item asks of the learner. A long phrase of unknown words asks more than a word. */
const loadOf = (course: Course, it: Item, known: Known): number => {
  if (it.kind !== "chunk") {
    return 1;
  }

  const words = wordsOf(it.text);

  const wordItems = wordItemsOf(course);

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
export const nextNewItems = (
  course: Course,
  l: Lesson,
  mem: Memory
): Item[] => {
  const waiting = l.items
    .filter((id) => !mem.has(id))
    .map((id) => course.item(id));

  const [first] = waiting;

  if (first === undefined || first.kind === "pattern") {
    return waiting.slice(0, 1);
  }

  const group = [first];
  let load = loadOf(course, first, mem);

  for (const next of waiting.slice(1)) {
    load += loadOf(course, next, mem);

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

const isPattern = (course: Course, id: string): boolean =>
  course.item(id).kind === "pattern";

/**
 * How an item is recalled depends on what it is, never on how urgent it is.
 * A pattern has no card, so it is always recalled inside a sentence. A word or a phrase is
 * recalled alone on its card while it is being learned: on the day it is taught, and again
 * after a miss. A card is quick, and it asks for exactly the item that is still weak.
 * After that the item is recalled inside sentences.
 */
const usesCarrier = (course: Course, m: Mem): boolean =>
  isPattern(course, m.id) || !isLearning(m);

export type ReviewPick =
  | { type: "sentence"; sentence: Sentence; covers: string[] }
  | { type: "card"; item: Item };

/** When each sentence was last used as a review, in milliseconds. A sentence that is missing was never used. */
export type SentenceSeen = Readonly<Record<string, number>>;

/** What limits the choice of a review. */
export interface PickLimits {
  /** When each sentence was last used as a review. */
  seen: SentenceSeen;
  /** Sentences already used in this session. */
  skipSentences: ReadonlySet<string>;
  /** Items the learner has just worked on. */
  skipItems?: ReadonlySet<string>;
}

interface Cover {
  sentence: Sentence;
  covers: string[];
}

/**
 * True if `a` is the better review. The sentence that clears more wanted items wins.
 * Among equals it is the one not used for the longest time: a word can have many sentences,
 * and a learner who always gets the same one learns the sentence by heart, not the word.
 * Then the shorter one.
 */
const isBetter = (a: Cover, b: Cover, seen: SentenceSeen): boolean => {
  if (a.covers.length !== b.covers.length) {
    return a.covers.length > b.covers.length;
  }

  const seenA = seen[a.sentence.id] ?? 0;
  const seenB = seen[b.sentence.id] ?? 0;

  return seenA === seenB
    ? a.sentence.tokens.length < b.sentence.tokens.length
    : seenA < seenB;
};

/** The best unused sentence among those that clear at least one wanted item. */
const bestCover = (
  course: Course,
  mem: Memory,
  wanted: ReadonlySet<string>,
  skipSentences: ReadonlySet<string>,
  seen: SentenceSeen
): Cover | null => {
  let best: Cover | null = null;

  if (wanted.size === 0) {
    return best;
  }

  for (const sentence of course.sentences) {
    if (!skipSentences.has(sentence.id)) {
      // Every wanted item is in memory, so these are the taught items the sentence clears.
      // Most sentences clear none, and that is cheaper to find out than whether one is usable.
      const covers = course
        .sentenceItems(sentence)
        .filter((id) => wanted.has(id));

      if (covers.length > 0 && sentenceReady(sentence, mem)) {
        const cover = { covers, sentence };

        if (best === null || isBetter(cover, best, seen)) {
          best = cover;
        }
      }
    }
  }

  return best;
};

/**
 * Picks a recall for the given items, which the caller wants recalled now.
 * Prefers the sentence that clears the most of them; falls back to a single card
 * for an item no sentence can cover. Null when nothing can recall any of them.
 */
export const pickRecall = (
  course: Course,
  mem: Memory,
  mems: readonly Mem[],
  { seen, skipItems = new Set(), skipSentences }: PickLimits
): ReviewPick | null => {
  const open = mems.filter((m) => !skipItems.has(m.id));

  const wanted = new Set(
    open.flatMap((m) => (usesCarrier(course, m) ? [m.id] : []))
  );

  const best = bestCover(course, mem, wanted, skipSentences, seen);

  if (best !== null) {
    return { covers: best.covers, sentence: best.sentence, type: "sentence" };
  }

  const single = open.find((m) => !isPattern(course, m.id));

  return single === undefined
    ? null
    : { item: course.item(single.id), type: "card" };
};

/** Picks the next review among the items whose scheduled review has arrived. */
export const pickReview = (
  course: Course,
  mem: Memory,
  now: number,
  limits: PickLimits
): ReviewPick | null =>
  pickRecall(course, mem, dueItems(mem, now).review, limits);

export interface RecallPlan {
  /** Sentences that each recall one or more of the items. */
  sentences: number;
  /** Cards for the items no sentence recalls. */
  cards: number;
}

/**
 * How many recalls it takes to recall each of the given items once, chosen the way `pickRecall`
 * chooses them one after another. An item that nothing can recall is left out.
 */
export const planRecalls = (
  course: Course,
  mem: Memory,
  mems: readonly Mem[],
  { seen, skipSentences }: PickLimits
): RecallPlan => {
  const carried = new Set(
    mems.flatMap((m) => (usesCarrier(course, m) ? [m.id] : []))
  );

  const left = new Set(mems.map((m) => m.id));
  const used = new Set(skipSentences);
  const plan = { cards: 0, sentences: 0 };

  while (left.size > 0) {
    const wanted = new Set([...left].filter((id) => carried.has(id)));
    const best = bestCover(course, mem, wanted, used, seen);

    if (best === null) {
      const next = [...left].find((id) => !isPattern(course, id));

      if (next === undefined) {
        break;
      }

      left.delete(next);
      plan.cards += 1;
    } else {
      used.add(best.sentence.id);

      for (const id of best.covers) {
        left.delete(id);
      }

      plan.sentences += 1;
    }
  }

  return plan;
};

export interface Compression {
  /** Items due for review now. */
  due: number;
  /** Reviews it would take to clear them. */
  tasks: number;
}

/** How many reviews would clear everything that is due now. Used for the Today screen. */
export const compression = (
  course: Course,
  mem: Memory,
  now: number,
  seen: SentenceSeen
): Compression => {
  const due = dueItems(mem, now).review;

  const plan = planRecalls(course, mem, due, {
    seen,
    skipSentences: new Set(),
  });

  return { due: due.length, tasks: plan.cards + plan.sentences };
};

/** Sentences that practise a pattern and use only taught words, shortest first. */
export const practiceFor = (
  course: Course,
  patternId: string,
  known: Known,
  limit: number
): Sentence[] => {
  const withPattern: Known = {
    has: (id) => id === patternId || known.has(id),
  };

  return course
    .sentencesWith(patternId)
    .filter((s) => sentenceReady(s, withPattern))
    .toSorted((a, b) => a.tokens.length - b.tokens.length)
    .slice(0, limit);
};

/**
 * The example sentence of a new item. It is chosen when the curriculum is built, for a learner who
 * takes the lessons in course order. A learner who took a later lesson first may not have met one of
 * its words yet: the example is then left out.
 */
export const exampleFor = (
  course: Course,
  it: Item,
  known: Known
): Sentence | null => {
  const example = course.exampleOf(it);
  const withItem: Known = { has: (id) => id === it.id || known.has(id) };

  return example !== null && sentenceReady(example, withItem) ? example : null;
};

export const nextStory = (
  course: Course,
  mem: Memory,
  done: ReadonlySet<string>
): Story | null =>
  course.stories.find((st) => !done.has(st.id) && storyReady(st, mem)) ?? null;
