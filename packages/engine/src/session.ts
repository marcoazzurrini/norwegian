// A study session: decides, one task at a time, what to do with the minutes the learner chose.
// Order of priority (docs/spec.md, section 3): sounds, items still being learned,
// due reviews, new material, then a story.
// What is recalled is decided here; how an item is recalled (alone on a card or inside
// a sentence) is decided by the picker in select.ts, the same way for every priority.
//
// A session never starts what it cannot finish. A new item needs recalls after it was taught, and
// each recall has a wait before it. The session teaches an item only while those waits still fit
// in its time, so no item is taught in the last minutes. A session too short for the waits
// teaches in its first half, and leaves the last recall to the next day.
// Time that is left when nothing is due and nothing new may be taught goes to reviews ahead of
// time, so that a session lasts as long as the learner chose.
// An item that is still being learned is owed one more recall before the session ends, unless it
// was recalled right a moment ago. The session keeps the time for those recalls in reserve, and
// starts a task only if the task fits in the time that is left over. When nothing fits any more,
// the session closes: it gives every item the recall it is owed, then it ends.
import type {
  Course,
  Item,
  Lesson,
  Sentence,
  SoundPair,
  Story,
} from "@norsk/course";

import {
  FINISH_MS,
  RECALLS_AFTER_TEACHING,
  hasWaited,
  isFresh,
  isLearning,
  passCounts,
} from "./memory";
import type { Mem } from "./memory";
import { typicalMs, withTime } from "./pace";
import type { Pace, PaceKind } from "./pace";
import {
  byDue,
  dueItems,
  nextLesson,
  nextNewItems,
  nextStory,
  pickRecall,
  planRecalls,
  practiceFor,
} from "./select";
import type { Due, Memory, SentenceSeen } from "./select";
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
  /** When each sentence was last used as a review. */
  sentenceSeen: SentenceSeen;
}

export interface SessionStats {
  /** Items exercised by review tasks. */
  reviewed: number;
  taught: number;
  right: number;
  wrong: number;
}

/**
 * Why the session chose its latest task, with the facts it decided on. The session does not use
 * this itself: it is for the journal, to find out later why a session went as it did.
 */
export interface Choice {
  /**
   * The step of the plan that gave the task:
   * "sound" the sounds at the start; "learning" an item in its first minutes that is due;
   * "planned" a review, new material or the story, as the time budget allows;
   * "waited" an item in its first minutes that is not due yet, for want of other work;
   * "spare" new material although recalls are going badly, because nothing else was left;
   * "ahead" a review that is not due yet, the one closest to it, because the session has time to spare;
   * "closing" a recall the session owes before it ends; "done" the end.
   */
  step:
    | "sound"
    | "learning"
    | "planned"
    | "waited"
    | "spare"
    | "ahead"
    | "closing"
    | "done";
  /** Time left of the session, in milliseconds. Below zero once the session runs over. */
  leftMs: number;
  /** Time left after the recalls the session owes. Null while the session closes. */
  spareMs: number | null;
  /** Reviews that are due. */
  dueReviews: number;
  /** Items in their first minutes that are due. */
  dueLearning: number;
  /** Items in their first minutes, due or not. */
  learning: number;
  /** Recalls the session owes before it ends. */
  owed: number;
  /** Too many of the latest recalls failed, so new material waits. */
  struggling: boolean;
  /** So many reviews are due that nothing new is taught. */
  backlog: boolean;
  /** Share of the session's time spent on reviews so far, from 0 to 1. */
  reviewShare: number;
  /** A task was left out, now or earlier, because the time left was too short for it. */
  shortOfTime: boolean;
}

/**
 * Share of the time in which the session may teach that reviews may take while new material is
 * still waiting. It is a share of that time, not of the whole session: otherwise reviews could
 * take all of it, and a learner with many reviews would be taught nothing.
 */
const REVIEW_SHARE = 0.6;

/** With this many reviews due, the session teaches nothing new. */
const BACKLOG = 40;

/**
 * New material waits while fewer than this share of the latest recall tasks were right at the first try.
 * Effort helps memory only when the recall succeeds in the end, so a learner who keeps missing
 * catches up first. The amount of new material is not capped otherwise: a count of new words
 * says nothing about whether they are being learned.
 */
const MIN_SUCCESS = 0.7;

/**
 * How many of the latest recall tasks the success rate is taken from, and how many it needs.
 * A task counts once, whether it is a card or a sentence: a sentence with five words that were
 * right says no more about how the learner is doing than one card that was right.
 */
const SUCCESS_TASKS = 10;
const MIN_SUCCESS_TASKS = 6;

/**
 * A session may always teach during this share of its time, from the start. A short session has
 * no room for the waits of a new item, and it would teach nothing: there the last recall of an
 * item is left to the next day.
 */
const TEACHING_SHARE = 0.5;

/** The session lengths a learner can choose from, in minutes. */
export const SESSION_LENGTHS = [5, 15, 30, 60] as const;

/**
 * The last story of a session is offered first once this share of the session has passed.
 * With more than one story, the earlier ones come at even steps before it.
 */
const STORY_AFTER = 0.7;
const MIN_MINUTES_FOR_EXTRAS = 15;

/** A session of at least this many minutes offers two stories. */
const MIN_MINUTES_FOR_TWO_STORIES = 60;

/** Time counted for one task is capped, so a break in the middle does not inflate study time. */
const MAX_TASK_MS = 3 * 60_000;

/**
 * With time to spare, the session reviews ahead of time, and picks among this many of the items
 * that are closest to due. Among few, a sentence cannot reach for items that are far from due.
 */
const AHEAD_ITEMS = 10;

/** A new pattern is practised with at most this many sentences. */
const PRACTICE_SENTENCES = 3;

/** How many of the last items are kept apart from the next task. */
const RECENT_ITEMS = 3;

const soundsFor = (minutes: number): number => {
  if (minutes >= 60) {
    return 10;
  }

  if (minutes >= 30) {
    return 8;
  }

  return minutes >= MIN_MINUTES_FOR_EXTRAS ? 6 : 0;
};

const storiesFor = (minutes: number): number => {
  if (minutes >= MIN_MINUTES_FOR_TWO_STORIES) {
    return 2;
  }

  return minutes >= MIN_MINUTES_FOR_EXTRAS ? 1 : 0;
};

/**
 * True if the item is owed a recall at this moment, before the session ends: it was taught or
 * missed and not recalled right since, or it has waited long enough for a pass to count.
 * An item that was recalled right a moment ago is not asked again just because the session ends.
 */
const isOwed = (m: Mem, at: number): boolean =>
  isLearning(m) && (isFresh(m) || hasWaited(m, at));

/** The kind of work a task is, for the time it takes. Sounds are short and are not planned for. */
const paceKindOf = (task: Task): PaceKind | null =>
  task.type === "sound" || task.type === "done" ? null : task.type;

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
const newMaterial = (
  course: Course,
  fresh: Item[],
  memory: Memory
): Task | null => {
  const [first] = fresh;

  if (first === undefined) {
    return null;
  }

  return first.kind === "pattern"
    ? {
        item: first,
        practice: practiceFor(course, first.id, memory, PRACTICE_SENTENCES),
        type: "pattern",
      }
    : { items: fresh, type: "intro" };
};

export class Session {
  readonly minutes: number;
  readonly budgetMs: number;
  readonly stats: SessionStats = { reviewed: 0, right: 0, taught: 0, wrong: 0 };
  elapsedMs = 0;
  private readonly course: Course;
  private readonly rng: () => number;
  private readonly soundsTotal: number;
  private readonly usedSentences = new Set<string>();
  private reviewMs = 0;
  private soundsLeft: number;
  private readonly storiesTotal: number;
  /** The stories offered in this session, so that none is offered twice. */
  private readonly storiesOffered = new Set<string>();
  /** The last few items the learner worked on, newest first. */
  private recent: string[] = [];
  /** The latest recall tasks, newest first: true if nothing in the task was wrong at the first try. */
  private firstTries: boolean[] = [];
  private paceNow: Pace;
  /** When the session was to end, as it stood when the session started to close. Null before that. */
  private endAt: number | null = null;
  private shortOfTime = false;
  /** Items recalled since the session started to close. */
  private readonly closed = new Set<string>();
  /** The last task taught something new. */
  private justTaught = false;
  private choice: Choice | null = null;

  /**
   * `course` is what the session teaches and reviews.
   * `rng` returns a number from 0 up to, but not including, 1, as Math.random does.
   * `pace` holds the times of the learner's earlier tasks; the session adds its own.
   */
  constructor(
    course: Course,
    minutes: number,
    rng: () => number,
    pace: Pace = {}
  ) {
    this.course = course;
    this.minutes = minutes;
    this.rng = rng;
    this.budgetMs = minutes * 60_000;
    this.soundsTotal = soundsFor(minutes);
    this.soundsLeft = this.soundsTotal;
    this.storiesTotal = storiesFor(minutes);
    this.paceNow = pace;
  }

  /** The times of the learner's latest tasks, with those of this session. To be saved after every task. */
  get pace(): Pace {
    return this.paceNow;
  }

  /** True once the session only recalls what is still being learned, before it ends. */
  get closing(): boolean {
    return this.endAt !== null;
  }

  /** True if the session closed because its time was used, false if nothing was left to do. */
  get timeUp(): boolean {
    return this.closing && this.shortOfTime;
  }

  /** Why the latest task was chosen. Null before the first task. */
  get lastChoice(): Choice | null {
    return this.choice;
  }

  get progress(): number {
    return Math.min(1, this.elapsedMs / this.budgetMs);
  }

  /** Adds time to the session, and remembers the items so that they do not come straight back. */
  record(ms: number, block: Block, itemIds: string[] = []): void {
    this.elapsedMs += ms;
    this.justTaught = block === "new";

    if (block === "review") {
      this.reviewMs += ms;
    }

    this.recent = [...itemIds.toReversed(), ...this.recent].slice(
      0,
      RECENT_ITEMS
    );

    if (this.closing) {
      for (const id of itemIds) {
        this.closed.add(id);
      }
    }
  }

  /**
   * Call when a task ends, with what it reported and how long it took.
   * Returns the time that counts as study time.
   */
  complete(task: Task, result: TaskResult, ms: number): number {
    const counted = Math.min(MAX_TASK_MS, ms);
    const block = blockOf(task);
    const kind = paceKindOf(task);
    this.record(counted, block, result.itemIds);

    if (kind !== null) {
      const pieces = task.type === "intro" ? task.items.length : 1;
      this.paceNow = withTime(this.paceNow, kind, counted / pieces);
    }

    this.stats.right += result.right;
    this.stats.wrong += result.wrong;
    this.stats.taught += result.taught;

    if (block === "review") {
      this.stats.reviewed += result.itemIds.length;
      this.firstTries = [result.wrong === 0, ...this.firstTries].slice(
        0,
        SUCCESS_TASKS
      );
    }

    return counted;
  }

  /** The next task, given the learner's state at this moment. */
  next(view: SessionView, now: number): Task {
    const task = this.choose(view, now);

    // A session uses a sentence once, and a sentence a pattern was practised with is used.
    if (task.type === "sentence") {
      this.usedSentences.add(task.sentence.id);
    }

    if (task.type === "pattern") {
      for (const sentence of task.practice) {
        this.usedSentences.add(sentence.id);
      }
    }

    if (task.type === "story") {
      this.storiesOffered.add(task.story.id);
    }

    return task;
  }

  private choose(view: SessionView, now: number): Task {
    if (this.endAt === null) {
      const task = this.workTask(view, now);

      if (task !== null) {
        return task;
      }

      this.endAt = now + Math.max(0, this.budgetMs - this.elapsedMs);
    }

    const closing = this.closingTask(view, this.endAt);

    this.choice = {
      ...this.factsOf(view, now),
      owed: this.owedAt(view, this.endAt).length,
      spareMs: null,
      step: closing === null ? "done" : "closing",
    };

    return closing ?? { type: "done" };
  }

  /** What the session knows at this moment, apart from the step that gives the task. */
  private factsOf(view: SessionView, now: number): Omit<Choice, "step"> {
    const due = dueItems(view.memory, now);

    return {
      backlog: due.review.length >= BACKLOG,
      dueLearning: due.learning.length,
      dueReviews: due.review.length,
      learning: [...view.memory.values()].filter((m) => isLearning(m)).length,
      leftMs: this.budgetMs - this.elapsedMs,
      owed: 0,
      reviewShare: this.reviewMs / this.budgetMs,
      shortOfTime: this.shortOfTime,
      spareMs: null,
      struggling: this.isStruggling(),
    };
  }

  /** The items that are owed a recall at the moment the session was to end, and did not get it yet. */
  private owedAt(view: SessionView, endAt: number): Mem[] {
    return [...view.memory.values()]
      .filter((m) => isOwed(m, endAt) && !this.closed.has(m.id))
      .toSorted(byDue);
  }

  /** The next task while there is time for more than the recalls the session owes. Null when it must close. */
  private workTask(view: SessionView, now: number): Task | null {
    const learning = [...view.memory.values()]
      .filter((m) => isLearning(m))
      .toSorted(byDue);

    // The recalls the session would owe if it worked until its time is up.
    const left = this.budgetMs - this.elapsedMs;
    const owed = learning.filter((m) => isOwed(m, now + left));
    const spare = left - this.reserveFor(view, owed);

    if (spare <= 0) {
      this.shortOfTime = true;

      return null;
    }

    const due = dueItems(view.memory, now);

    // Each step of the plan, in order. The first that has a task gives it.
    const steps: [Choice["step"], () => Task | null][] = [
      ["sound", () => (this.soundsLeft > 0 ? this.nextSound(view) : null)],
      ["learning", () => this.learningTask(view, due)],
      [
        "planned",
        () => this.plannedTask(view, due, spare, this.isStruggling()),
      ],
      ["waited", () => this.waitedTask(view, learning, now)],
      // Nothing else is left to do: new material is better than ending the session early.
      ["spare", () => this.plannedTask(view, due, spare, false)],
      ["ahead", () => this.fit(this.aheadTask(view, now), spare)],
    ];

    for (const [step, find] of steps) {
      const task = find();

      if (task !== null) {
        this.choice = {
          ...this.factsOf(view, now),
          owed: owed.length,
          spareMs: spare,
          step,
        };

        return task;
      }
    }

    return null;
  }

  /** The time to recall each of these items once. */
  private reserveFor(view: SessionView, mems: readonly Mem[]): number {
    const plan = planRecalls(this.course, view.memory, mems, {
      seen: view.sentenceSeen,
      skipSentences: this.usedSentences,
    });

    return (
      plan.sentences * typicalMs(this.paceNow, "sentence") +
      plan.cards * typicalMs(this.paceNow, "card")
    );
  }

  /** The time a task takes, with the recalls it commits the session to. */
  private costOf(task: Task): number {
    const typical = (kind: PaceKind): number => typicalMs(this.paceNow, kind);

    switch (task.type) {
      case "intro": {
        return (
          task.items.length *
          (typical("intro") + RECALLS_AFTER_TEACHING * typical("card"))
        );
      }

      case "pattern": {
        return (
          typical("pattern") + RECALLS_AFTER_TEACHING * typical("sentence")
        );
      }

      case "card":
      case "sentence":
      case "story": {
        return typical(task.type);
      }

      // Sounds are short and come first; the end of a session takes no time.
      case "sound":
      case "done": {
        return 0;
      }

      default: {
        return task satisfies never;
      }
    }
  }

  /** The task, if there is time for it. */
  private fit(task: Task | null, spare: number): Task | null {
    if (task === null || this.costOf(task) <= spare) {
      return task;
    }

    this.shortOfTime = true;

    return null;
  }

  /** True while too many of the latest recall tasks failed: new material waits until the learner has caught up. */
  private isStruggling(): boolean {
    const tasks = this.firstTries.length;
    const right = this.firstTries.filter(Boolean).length;

    return tasks >= MIN_SUCCESS_TASKS && right / tasks < MIN_SUCCESS;
  }

  /**
   * The time left for teaching. Teaching stops early enough for the waits a new item needs
   * before its recalls, but never before the share of the session that is kept for it.
   * Zero or less once nothing new is taught any more.
   */
  private teachingMs(): number {
    return this.teachUntilMs() - this.elapsedMs;
  }

  /** How far into the session new material may still be taught. */
  private teachUntilMs(): number {
    return Math.max(this.budgetMs - FINISH_MS, this.budgetMs * TEACHING_SHARE);
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

  /**
   * Items in their first minutes, or learned again after a miss, come back as soon as they are due,
   * but not straight after the learner worked on them.
   */
  private learningTask(view: SessionView, due: Due): Task | null {
    return this.recallTask(view, due.learning, "learning", this.recent);
  }

  /** Reviews, new material and the story, in the order the time budget allows. Only what fits in the spare time. */
  private plannedTask(
    view: SessionView,
    due: Due,
    spare: number,
    holdNew: boolean
  ): Task | null {
    const { memory } = view;

    const lesson =
      holdNew || due.review.length >= BACKLOG
        ? null
        : nextLesson(this.course, memory, view.chosenLesson);

    const offered = this.storiesOffered.size;

    const found =
      offered < this.storiesTotal
        ? nextStory(
            this.course,
            memory,
            new Set([...view.storiesDone, ...this.storiesOffered])
          )
        : null;

    const story: Task | null =
      found === null ? null : { story: found, type: "story" };

    // The time from which the next story comes before reviews and new material.
    const storyFrom =
      (this.budgetMs * STORY_AFTER * (offered + 1)) /
      Math.max(1, this.storiesTotal);

    if (this.elapsedMs >= storyFrom) {
      const now = this.fit(story, spare);

      if (now !== null) {
        return now;
      }
    }

    const review = (): Task | null =>
      this.recallTask(view, due.review, "review", this.recent);

    const fresh = (): Task | null =>
      lesson === null ? null : this.newTask(lesson, memory, spare);

    const reviewFirst =
      due.review.length > 0 &&
      (lesson === null || this.reviewMs < this.teachUntilMs() * REVIEW_SHARE);

    // New material that no longer fits leaves the rest of the time to reviews.
    const [first, second] = reviewFirst ? [review, fresh] : [fresh, review];

    return (
      this.fit(first(), spare) ??
      this.fit(second(), spare) ??
      this.fit(story, spare)
    );
  }

  /**
   * The next new material of the lesson, if the session can still finish it: teach it, and give
   * it every recall it needs after the wait of each. A group that is too big is cut down to what fits.
   */
  private newTask(lesson: Lesson, memory: Memory, spare: number): Task | null {
    const task = newMaterial(
      this.course,
      nextNewItems(this.course, lesson, memory),
      memory
    );

    if (task === null) {
      return null;
    }

    const each = typicalMs(
      this.paceNow,
      task.type === "intro" ? "intro" : "pattern"
    );

    // How many items can be taught while the session may still teach.
    const finishable = Math.floor(this.teachingMs() / Math.max(1, each));

    if (finishable < 1) {
      this.shortOfTime = true;

      return null;
    }

    if (task.type !== "intro") {
      return task;
    }

    const [first] = task.items;

    const one =
      first === undefined ? 0 : this.costOf({ ...task, items: [first] });

    const affordable = one > 0 ? Math.floor(spare / one) : task.items.length;
    const room = Math.min(affordable, finishable);

    // With no room for a single item the whole group is returned, and found not to fit.
    return room >= 1 && room < task.items.length
      ? { ...task, items: task.items.slice(0, room) }
      : task;
  }

  /** A recall of some of the given items: a sentence that covers several, or a card for one. */
  private recallTask(
    view: SessionView,
    mems: readonly Mem[],
    reason: "learning" | "review",
    skipItems: readonly string[]
  ): Task | null {
    const pick = pickRecall(this.course, view.memory, mems, {
      seen: view.sentenceSeen,
      skipItems: new Set(skipItems),
      skipSentences: this.usedSentences,
    });

    if (pick?.type === "sentence") {
      return { covers: pick.covers, sentence: pick.sentence, type: "sentence" };
    }

    return pick === null ? null : { item: pick.item, reason, type: "card" };
  }

  /**
   * Nothing else to do: bring back items that are still being learned and have waited long
   * enough for a pass to count, even if they are not due yet.
   */
  private waitedTask(
    view: SessionView,
    learning: readonly Mem[],
    now: number
  ): Task | null {
    const waited = learning.filter((m) => hasWaited(m, now));

    return this.recallTask(view, waited, "learning", this.recent.slice(0, 1));
  }

  /**
   * Time to spare and nothing to do with it: a review ahead of time, of the items that are closest
   * to due. Such a review loses the least of the wait the item was given, and its recall is the
   * hardest of those to choose from. An item recalled earlier the same day is left out: a pass
   * would add nothing.
   */
  private aheadTask(view: SessionView, now: number): Task | null {
    const closest = [...view.memory.values()]
      .filter((m) => !isLearning(m) && passCounts(m, now))
      .toSorted(byDue)
      .slice(0, AHEAD_ITEMS);

    return this.recallTask(view, closest, "review", this.recent);
  }

  /**
   * The session is closing: every item gets the recall it is owed, the one that has waited
   * longest first, and each item once. A recall that comes too early to count is still practice.
   * What is owed is judged at the moment the session was to end, which is the moment the time
   * was reserved for. Judged again after every recall, items would keep joining as time passes.
   * Null when every item had its recall, or nothing can recall the ones left.
   */
  private closingTask(view: SessionView, endAt: number): Task | null {
    const owed = this.owedAt(view, endAt);

    return (
      this.recallTask(view, owed, "learning", this.recent.slice(0, 1)) ??
      // The only item left was taught a moment ago: a recall straight away is better than none.
      (this.justTaught ? this.recallTask(view, owed, "learning", []) : null)
    );
  }

  /** Favours the sound contrasts the learner gets wrong most often. */
  private pickSound(view: SessionView): SoundPair {
    const weight = (p: SoundPair): number => {
      const s = view.soundStats[p.group];

      return s !== undefined && s.total >= 4 ? 1.2 - s.right / s.total : 1;
    };

    const { sounds } = this.course;
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
