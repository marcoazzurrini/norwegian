// A study session: decides, one task at a time, what to do with the minutes the learner chose.
// Order of priority (docs/spec.md, section 3): sounds, items still being learned,
// due reviews, new material, then a story.
import { item, sounds } from "@norsk/content";
import type { Item, Sentence, SoundPair, Story } from "@norsk/content";

import { dueTime, isLearning } from "./memory";
import {
  byDue,
  dueItems,
  nextLesson,
  nextNewItems,
  nextStory,
  pickReview,
  practiceFor,
} from "./select";
import type { Due, Memory } from "./select";
import type { TaskResult } from "./tasks/types";

export type Task =
  | {
      type: "sound";
      pair: SoundPair;
      target: "a" | "b";
      index: number;
      total: number;
    }
  | { type: "intro"; items: Item[] }
  | { type: "pattern"; item: Item; practice: Sentence[] }
  | { type: "card"; item: Item; reason: "learning" | "review" }
  | { type: "sentence"; sentence: Sentence; covers: string[] }
  | { type: "story"; story: Story }
  | { type: "done" };

export type Block = "sounds" | "review" | "new" | "story";

export interface SoundStats {
  right: number;
  total: number;
}

/** What the session needs to know about the learner each time it picks a task. */
export interface SessionView {
  memory: Memory;
  storiesDone: ReadonlySet<string>;
  /** Lesson picked on the Map, taught next if it is ready. */
  chosenLesson: number | null;
  /** Right and total answers per sound group. */
  soundStats: Readonly<Record<string, SoundStats>>;
}

export interface SessionStats {
  /** Items exercised by review tasks. */
  reviewed: number;
  taught: number;
  right: number;
  wrong: number;
}

/** Share of the session that reviews may take while new material is still waiting. */
const REVIEW_SHARE = 0.6;

/** With this many reviews due, the session teaches nothing new. */
const BACKLOG = 40;

/** A story is offered once this share of the session has passed. */
const STORY_AFTER = 0.7;
const MIN_MINUTES_FOR_EXTRAS = 15;

/** Time counted for one task is capped, so a break in the middle does not inflate study time. */
const MAX_TASK_MS = 3 * 60_000;

/** An item that is still being learned may come back this much before it is due, when nothing else is left. */
const EARLY_MS = 3 * 60_000;

/** A new pattern is practised with at most this many sentences. */
const PRACTICE_SENTENCES = 3;

/** How many of the last items are kept apart from the next task. */
const RECENT_ITEMS = 3;

const soundsFor = (minutes: number): number => {
  if (minutes >= 40) {
    return 10;
  }

  if (minutes >= 25) {
    return 8;
  }

  return minutes >= MIN_MINUTES_FOR_EXTRAS ? 6 : 0;
};

const isPattern = (id: string): boolean => item(id).kind === "pattern";

export const blockOf = (task: Task): Block => {
  if (task.type === "sound") {
    return "sounds";
  }

  if (task.type === "story") {
    return "story";
  }

  return task.type === "intro" || task.type === "pattern" ? "new" : "review";
};

/** The first of the new items decides the task: a pattern is taught alone, words and phrases as a group. */
const newMaterial = (fresh: Item[], memory: Memory): Task | null => {
  const [first] = fresh;

  if (first === undefined) {
    return null;
  }

  return first.kind === "pattern"
    ? {
        item: first,
        practice: practiceFor(first.id, memory, PRACTICE_SENTENCES),
        type: "pattern",
      }
    : { items: fresh, type: "intro" };
};

export class Session {
  readonly minutes: number;
  readonly budgetMs: number;
  readonly stats: SessionStats = { reviewed: 0, right: 0, taught: 0, wrong: 0 };
  elapsedMs = 0;
  private readonly rng: () => number;
  private readonly soundsTotal: number;
  private readonly usedSentences = new Set<string>();
  private reviewMs = 0;
  private soundsLeft: number;
  private storyOffered = false;
  /** The last few items the learner worked on, newest first. */
  private recent: string[] = [];

  /** `rng` returns a number from 0 up to, but not including, 1, as Math.random does. */
  constructor(minutes: number, rng: () => number) {
    this.minutes = minutes;
    this.rng = rng;
    this.budgetMs = minutes * 60_000;
    this.soundsTotal = soundsFor(minutes);
    this.soundsLeft = this.soundsTotal;
  }

  get progress(): number {
    return Math.min(1, this.elapsedMs / this.budgetMs);
  }

  /** Adds time to the session, and remembers the items so that they do not come straight back. */
  record(ms: number, block: Block, itemIds: string[] = []): void {
    this.elapsedMs += ms;

    if (block === "review") {
      this.reviewMs += ms;
    }

    this.recent = [...itemIds.toReversed(), ...this.recent].slice(
      0,
      RECENT_ITEMS
    );
  }

  /**
   * Call when a task ends, with what it reported and how long it took.
   * Returns the time that counts as study time.
   */
  complete(task: Task, result: TaskResult, ms: number): number {
    const counted = Math.min(MAX_TASK_MS, ms);
    const block = blockOf(task);
    this.record(counted, block, result.itemIds);
    this.stats.right += result.right;
    this.stats.wrong += result.wrong;
    this.stats.taught += result.taught;

    if (block === "review") {
      this.stats.reviewed += result.itemIds.length;
    }

    return counted;
  }

  /** The next task, given the learner's state at this moment. */
  next(view: SessionView, now: number): Task {
    if (this.elapsedMs >= this.budgetMs) {
      return { type: "done" };
    }

    if (this.soundsLeft > 0) {
      return this.nextSound(view);
    }

    const due = dueItems(view.memory, now);

    return (
      this.learningCard(due) ??
      this.plannedTask(view, due, now) ??
      this.earlyCard(view.memory, now) ?? { type: "done" }
    );
  }

  private nextSound(view: SessionView): Task {
    const index = this.soundsTotal - this.soundsLeft;
    this.soundsLeft -= 1;
    const pair = this.pickSound(view);

    return {
      index,
      pair,
      target: this.rng() < 0.5 ? "a" : "b",
      total: this.soundsTotal,
      type: "sound",
    };
  }

  /** Items in their first minutes come back as soon as they are due, but not twice in a row. */
  private learningCard(due: Due): Task | null {
    const learning = due.learning.find(
      (m) => !this.recent.includes(m.id) && !isPattern(m.id)
    );

    return learning === undefined
      ? null
      : { item: item(learning.id), reason: "learning", type: "card" };
  }

  /** Reviews, new material and the story, in the order the time budget allows. */
  private plannedTask(view: SessionView, due: Due, now: number): Task | null {
    const { memory } = view;

    const lesson =
      due.review.length >= BACKLOG
        ? null
        : nextLesson(memory, view.chosenLesson);

    const story =
      this.minutes >= MIN_MINUTES_FOR_EXTRAS && !this.storyOffered
        ? nextStory(memory, view.storiesDone)
        : null;

    if (story !== null && this.elapsedMs >= this.budgetMs * STORY_AFTER) {
      return this.offer(story);
    }

    const reviewFirst =
      due.review.length > 0 &&
      (lesson === null || this.reviewMs < this.budgetMs * REVIEW_SHARE);

    const task =
      (reviewFirst ? this.reviewTask(memory, now) : null) ??
      (lesson === null
        ? null
        : newMaterial(nextNewItems(lesson, memory), memory));

    if (task !== null || story === null) {
      return task;
    }

    return this.offer(story);
  }

  private reviewTask(memory: Memory, now: number): Task | null {
    const pick = pickReview(
      memory,
      now,
      this.usedSentences,
      new Set(this.recent)
    );

    if (pick?.type === "sentence") {
      this.usedSentences.add(pick.sentence.id);

      return { covers: pick.covers, sentence: pick.sentence, type: "sentence" };
    }

    return pick === null
      ? null
      : { item: pick.item, reason: "review", type: "card" };
  }

  /** Nothing else to do: bring back an item that is still being learned, even if it is a little early. */
  private earlyCard(memory: Memory, now: number): Task | null {
    const [last] = this.recent;

    const [waiting] = [...memory.values()]
      .filter((m) => isLearning(m) && !isPattern(m.id) && m.id !== last)
      .toSorted(byDue);

    return waiting !== undefined && dueTime(waiting) - now < EARLY_MS
      ? { item: item(waiting.id), reason: "learning", type: "card" }
      : null;
  }

  private offer(story: Story): Task {
    this.storyOffered = true;

    return { story, type: "story" };
  }

  /** Favours the sound contrasts the learner gets wrong most often. */
  private pickSound(view: SessionView): SoundPair {
    const weight = (p: SoundPair): number => {
      const s = view.soundStats[p.group];

      return s !== undefined && s.total >= 4 ? 1.2 - s.right / s.total : 1;
    };

    const total = sounds.reduce((sum, p) => sum + weight(p), 0);
    let r = this.rng() * total;

    for (const p of sounds) {
      r -= weight(p);

      if (r <= 0) {
        return p;
      }
    }

    // Rounding can leave a sliver above zero after the last pair.
    const [first] = sounds;

    if (first === undefined) {
      throw new Error("The curriculum has no sound pairs");
    }

    return first;
  }
}
