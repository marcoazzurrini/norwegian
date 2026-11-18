// Decides what the learner can do next: which sentences are usable, which items are due,
// and which review clears the most due items at once ("compression").
import {
  items,
  lessons,
  sentenceItems,
  sentences,
  stories,
} from "@norsk/content";
import type { Item, Lesson, Sentence, Story, Token } from "@norsk/content";

import { CARRIER_MIN_DAYS, isDue, isLearning, isStable } from "./memory";
import type { Mem } from "./memory";

export type Memory = ReadonlyMap<string, Mem>;

export type ItemState = "locked" | "ready" | "learning" | "stable";

export type LessonState = "locked" | "ready" | "started" | "done";

const tokenReady = (t: Token, mem: Memory): boolean => {
  if (t.free) {
    return true;
  }

  if (t.c && mem.has(t.c)) {
    return true;
  }

  const patternsKnown = (t.p ?? []).every((p) => mem.has(p));

  if (t.w) {
    return mem.has(t.w) && patternsKnown;
  }

  return !!t.p?.length && patternsKnown;
};

const chunkCovered = (t: Token, mem: Memory) =>
  t.free || (!!t.c && mem.has(t.c));

/** A sentence is usable once every word in it has been taught. */
export function sentenceReady(s: Sentence, mem: Memory): boolean {
  if (!s.tokens.every((t) => tokenReady(t, mem))) {
    return false;
  }

  return (
    s.tokens.every((t) => chunkCovered(t, mem)) ||
    s.patterns.every((p) => mem.has(p))
  );
}

/** A story is readable once its words are taught. Grammar is not required for reading. */
export function storyReady(st: Story, mem: Memory): boolean {
  return st.lines.every((l) =>
    l.tokens.every(
      (t) => t.free || (t.c && mem.has(t.c)) || (t.w ? mem.has(t.w) : true)
    )
  );
}

/** The taught items a sentence exercises. */
export const exercised = (s: Sentence, mem: Memory): string[] =>
  sentenceItems(s).filter((id) => mem.has(id));

export function lessonState(l: Lesson, mem: Memory): LessonState {
  const taught = l.items.filter((id) => mem.has(id)).length;

  if (taught === l.items.length) {
    return "done";
  }

  if (taught > 0) {
    return "started";
  }

  return l.needs.every((n) => lessonState(lessons[n], mem) === "done")
    ? "ready"
    : "locked";
}

export function itemState(it: Item, mem: Memory): ItemState {
  const m = mem.get(it.id);

  if (m) {
    return isStable(m) ? "stable" : "learning";
  }

  const ls = lessonState(lessons[it.lesson], mem);

  return ls === "ready" || ls === "started" ? "ready" : "locked";
}

/** The lesson to teach next: the one in progress, else the chosen one, else the earliest ready one. */
export function nextLesson(mem: Memory, chosen?: number | null): Lesson | null {
  const started = lessons.find((l) => lessonState(l, mem) === "started");

  if (started) {
    return started;
  }

  if (chosen != null && lessonState(lessons[chosen], mem) === "ready") {
    return lessons[chosen];
  }

  return lessons.find((l) => lessonState(l, mem) === "ready") ?? null;
}

/** How many new words or phrases are shown together before the learner types them back. */
export const INTRO_BATCH = 3;

/**
 * The next new material of a lesson: one pattern, or a small group of words and phrases.
 * A group puts other items between seeing a word and typing it, so the first recall
 * comes from memory and is not a copy of what is still in mind.
 */
export const nextNewItems = (l: Lesson, mem: Memory): Item[] => {
  const waiting = l.items.filter((i) => !mem.has(i)).map((i) => items[i]);

  if (!waiting.length || waiting[0].kind === "pattern") {
    return waiting.slice(0, 1);
  }

  const stop = waiting.findIndex((it) => it.kind === "pattern");

  return waiting.slice(
    0,
    Math.min(INTRO_BATCH, stop === -1 ? waiting.length : stop)
  );
};

export interface Due {
  /** Items in their first minutes of learning, or relearning after a miss. */
  learning: Mem[];
  /** Items whose scheduled review has arrived. */
  review: Mem[];
}

export function dueItems(mem: Memory, now: number): Due {
  const learning: Mem[] = [];
  const review: Mem[] = [];

  for (const m of mem.values()) {
    if (!isDue(m, now)) {
      continue;
    }

    if (isLearning(m)) {
      learning.push(m);
    } else {
      review.push(m);
    }
  }

  const byDue = (a: Mem, b: Mem) =>
    new Date(a.card.dueAt).getTime() - new Date(b.card.dueAt).getTime();

  return { learning: learning.sort(byDue), review: review.sort(byDue) };
}

/** An item is reviewed inside sentences once it is past its first days. Patterns can only be reviewed that way. */
const usesCarrier = (m: Mem) =>
  items[m.id].kind === "pattern" || m.card.stability >= CARRIER_MIN_DAYS;

export type ReviewPick =
  | { type: "sentence"; sentence: Sentence; covers: string[] }
  | { type: "card"; item: Item };

/**
 * Picks the next review. Prefers the sentence that clears the most due items;
 * falls back to a single card for an item no sentence can cover.
 */
export function pickReview(
  mem: Memory,
  now: number,
  skipSentences: ReadonlySet<string>,
  skipItems: ReadonlySet<string> = new Set()
): ReviewPick | null {
  const due = dueItems(mem, now).review.filter((m) => !skipItems.has(m.id));

  if (!due.length) {
    return null;
  }

  const wanted = new Set(due.filter(usesCarrier).map((m) => m.id));

  let best: { sentence: Sentence; covers: string[]; score: number } | null =
    null;

  if (wanted.size) {
    for (const s of sentences) {
      if (skipSentences.has(s.id) || !sentenceReady(s, mem)) {
        continue;
      }

      const covers = exercised(s, mem).filter((id) => wanted.has(id));

      if (!covers.length) {
        continue;
      }

      // More due items first; among equals, the shorter sentence.
      const score = covers.length - s.tokens.length * 0.04;

      if (!best || score > best.score) {
        best = { sentence: s, covers, score };
      }
    }
  }

  if (best) {
    return { type: "sentence", sentence: best.sentence, covers: best.covers };
  }

  const single = due.find((m) => items[m.id].kind !== "pattern");

  return single ? { type: "card", item: items[single.id] } : null;
}

/** How many sentence reviews would clear everything that is due now. Used for the Today screen. */
export function compression(
  mem: Memory,
  now: number
): { due: number; tasks: number } {
  const due = dueItems(mem, now).review;
  const left = new Set(due.map((m) => m.id));
  const used = new Set<string>();
  let tasks = 0;

  while (left.size) {
    let best: { id: string; covers: string[] } | null = null;

    for (const s of sentences) {
      if (used.has(s.id) || !sentenceReady(s, mem)) {
        continue;
      }

      const covers = exercised(s, mem).filter(
        (id) => left.has(id) && usesCarrier(mem.get(id)!)
      );

      if (covers.length > (best?.covers.length ?? 0)) {
        best = { id: s.id, covers };
      }
    }

    if (best) {
      used.add(best.id);

      for (const id of best.covers) {
        left.delete(id);
      }
    } else {
      const next = [...left].find((id) => items[id].kind !== "pattern");

      if (!next) {
        break;
      }

      left.delete(next);
    }

    tasks++;
  }

  return { due: due.length, tasks };
}

/** Sentences that practise a pattern and use only taught words. `extra` holds items being taught right now. */
export function practiceFor(
  patternId: string,
  mem: Memory,
  limit: number
): Sentence[] {
  const withPattern = new Map(mem);

  if (!withPattern.has(patternId)) {
    withPattern.set(patternId, undefined as unknown as Mem);
  }

  return sentences
    .filter(
      (s) =>
        sentenceItems(s).includes(patternId) && sentenceReady(s, withPattern)
    )
    .sort((a, b) => a.tokens.length - b.tokens.length)
    .slice(0, limit);
}

export const nextStory = (
  mem: Memory,
  done: ReadonlySet<string>
): Story | null =>
  stories.find((st) => !done.has(st.id) && storyReady(st, mem)) ?? null;
