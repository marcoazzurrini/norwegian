// Memory model: one FSRS card per item (see docs/spec.md, section 2).
import { DefaultScheduler, Rating } from "ts-fsrs";

/** The FSRS-6 memory state of one item. This is the shape that is saved and synced. */
export interface Card {
  cardId: string | number;
  /** Days until the chance of recall drops to 90%. */
  stability: number;
  difficulty: number;
  dueAt: Date;
  lastReviewAt: Date | null;
  scheduleStatus: "new" | "learning" | "review";
  state: 0 | 1 | 2 | 3;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
}

/** A configured scheduler. Callers pass it around; only this module looks inside. */
export interface Scheduler {
  readonly fsrs: DefaultScheduler<"FSRS-6">;
  readonly desiredRetention: number;
}

export interface Mem {
  id: string;
  card: Card;
  introducedAt: number;
}

export type Grade = "again" | "good";

/**
 * One answer to record for an item. `carrier` marks a recall made inside a sentence.
 * It is kept in the log; a pass counts the same on a card and inside a sentence.
 */
export interface ReviewInput {
  id: string;
  grade: Grade;
  carrier?: boolean;
}

/** Items at or above this stability (in days) count as stable. */
const STABLE_DAYS = 21;

/** A second pass of an item within this time adds no new evidence: the item was just recalled. */
const SAME_DAY_MS = 12 * 3_600_000;

/**
 * An item that is still being learned waits a few minutes between recalls, so that it has left
 * the mind before it is recalled again. A pass counts once this share of the wait is over.
 * Memory has no sharp line here: the share is a judgement, not a measurement.
 */
const EARLY_SHARE = 0.5;

const DAY = 86_400_000;

/**
 * The waits of an item that is new, in minutes. The first successful recall, when the item is
 * taught, takes the item past the first wait.
 */
const LEARNING_MINUTES = [1, 5, 15] as const;

/** The waits a new item still has after it was taught, in milliseconds. */
const WAITS_AFTER_TEACHING = LEARNING_MINUTES.slice(1).map(
  (minutes) => minutes * 60_000
);

/** How many recalls a new item needs after it was taught, before it is scheduled in days. */
export const RECALLS_AFTER_TEACHING = WAITS_AFTER_TEACHING.length;

/**
 * The shortest time after teaching in which a new item can have all the recalls it needs.
 * Each recall comes when its wait is over. Only the last may come early, as soon as it counts,
 * because the end of a session does not wait for it.
 */
export const FINISH_MS = WAITS_AFTER_TEACHING.reduce(
  (sum, wait, index, waits) =>
    sum + (index === waits.length - 1 ? EARLY_SHARE * wait : wait),
  0
);

// Saved cards can hold dates as text (a backup file, an older version), so every read goes through Date.
const time = (date: Date): number => new Date(date).getTime();

export const dueTime = (m: Mem): number => time(m.card.dueAt);

export const createScheduler = async (
  desiredRetention: number
): Promise<Scheduler> => {
  const fsrs = await DefaultScheduler({
    desiredRetention,
    enableFuzz: false,
    enableShortTerm: true,
    learningSteps: LEARNING_MINUTES.map((minutes) => `${minutes}m` as const),
    relearningSteps: ["5m"],
    version: "FSRS-6",
  });

  return { desiredRetention, fsrs };
};

export const isLearning = (m: Mem): boolean =>
  m.card.scheduleStatus !== "review";

export const isDue = (m: Mem, now: number): boolean => dueTime(m) <= now;

export const isStable = (m: Mem): boolean =>
  !isLearning(m) && m.card.stability >= STABLE_DAYS;

/**
 * How well an item is known, from 0 to 1. A stable item counts in full. Before that the
 * credit follows the logarithm of the stability, because memory grows by multiplying:
 * going from one day to three is as much of a step as going from a week to three weeks.
 */
export const strength = (m: Mem): number =>
  isStable(m)
    ? 1
    : Math.min(1, Math.log1p(m.card.stability) / Math.log1p(STABLE_DAYS));

/** Chance, from 0 to 1, that the item would be recalled right now. */
export const retrievability = (s: Scheduler, m: Mem, now: number): number => {
  if (m.card.lastReviewAt === null) {
    return 0;
  }

  const elapsed = Math.max(0, (now - time(m.card.lastReviewAt)) / DAY);

  return s.fsrs.model.forgettingCurve(m.card, elapsed);
};

/** First successful recall of a new item. */
export const introduce = (s: Scheduler, id: string, now: number): Mem => {
  // Without an id of our own the library makes up a random one, and the same call would give different cards.
  const fresh = s.fsrs.newCard({ cardId: id, now: new Date(now) });

  const { card } = s.fsrs.review({
    card: fresh,
    grade: Rating.Good,
    now: new Date(now),
  });

  return { card, id, introducedAt: now };
};

/**
 * Applies one review. A typed sentence makes the learner recall every word in it, and the
 * answer shows which word failed, so a pass inside a sentence counts as much as one on a card.
 */
export const review = (
  s: Scheduler,
  m: Mem,
  grade: Grade,
  now: number
): Mem => {
  const { card } = s.fsrs.review({
    card: m.card,
    grade: grade === "good" ? Rating.Good : Rating.Again,
    now: new Date(now),
  });

  return { ...m, card };
};

/** When the item was last recalled, or first learned. */
const lastRecall = (m: Mem): number =>
  m.card.lastReviewAt === null ? m.introducedAt : time(m.card.lastReviewAt);

/**
 * True if a pass now would count: the item has waited long enough since its last recall.
 * Only an item that is still being learned can be too early. There is no upper limit:
 * a recall that comes late always counts.
 */
export const hasWaited = (m: Mem, now: number): boolean => {
  const last = lastRecall(m);

  return !isLearning(m) || now - last >= EARLY_SHARE * (dueTime(m) - last);
};

/**
 * True if the item was taught or missed and has not been recalled right since.
 * Teaching is the item's first review; a miss sends an item back to the first of its waits.
 */
export const isFresh = (m: Mem): boolean =>
  isLearning(m) && (m.card.reps === 1 || m.card.learningStep === 0);

/**
 * True if a pass now would add evidence: the item has left the mind since its last recall.
 * An item that is still being learned must have waited long enough; any other item must not
 * have been recalled on the same day.
 */
export const passCounts = (m: Mem, now: number): boolean =>
  isLearning(m) ? hasWaited(m, now) : now - lastRecall(m) >= SAME_DAY_MS;

/**
 * Applies one recorded answer, or returns null when it adds no evidence and must not be recorded.
 * That is a pass that comes too soon after the last recall, when the item was still in mind.
 * It does not matter whether the pass was on a card or inside a sentence.
 * Such a pass is practice. A miss always counts.
 */
export const applyReview = (
  s: Scheduler,
  m: Mem,
  input: ReviewInput,
  now: number
): Mem | null =>
  input.grade === "good" && !passCounts(m, now)
    ? null
    : review(s, m, input.grade, now);
