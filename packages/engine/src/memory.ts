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

/** One answer to record for an item. `carrier` marks a recall made inside a sentence. */
export interface ReviewInput {
  id: string;
  grade: Grade;
  carrier?: boolean;
}

/** Share of the stability gain an item keeps when it was recalled inside a sentence, where context helps. */
const CARRIER_CREDIT = 0.8;

/** Items at or above this stability (in days) count as stable. */
const STABLE_DAYS = 21;

/** Below this stability (in days), a word or chunk is reviewed on its own card, not inside a sentence. */
export const CARRIER_MIN_DAYS = 3;

/** A second pass inside a sentence within this time adds no new evidence. */
const SAME_DAY_MS = 12 * 3_600_000;

const DAY = 86_400_000;

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
    learningSteps: ["1m", "5m", "15m"],
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
 * Applies one review.
 * `carrier` marks a recall made inside a sentence: a pass then keeps only part of its stability gain.
 */
export const review = (
  s: Scheduler,
  m: Mem,
  grade: Grade,
  now: number,
  carrier = false
): Mem => {
  const before = m.card;

  const { card } = s.fsrs.review({
    card: before,
    grade: grade === "good" ? Rating.Good : Rating.Again,
    now: new Date(now),
  });

  if (
    carrier &&
    grade === "good" &&
    before.scheduleStatus === "review" &&
    card.stability > before.stability
  ) {
    const stability =
      before.stability + CARRIER_CREDIT * (card.stability - before.stability);

    const adjusted = { ...card, stability };

    const days = Math.max(
      1,
      Math.round(s.fsrs.model.nextInterval(adjusted, s.desiredRetention))
    );

    return {
      ...m,
      card: {
        ...adjusted,
        dueAt: new Date(now + days * DAY),
        scheduledDays: days,
      },
    };
  }

  return { ...m, card };
};

/**
 * Applies one recorded answer, or returns null when it adds no evidence and must not be recorded:
 * a second pass inside a sentence on the same day.
 */
export const applyReview = (
  s: Scheduler,
  m: Mem,
  input: ReviewInput,
  now: number
): Mem | null => {
  const carrier = input.carrier === true;

  const last = m.card.lastReviewAt === null ? 0 : time(m.card.lastReviewAt);

  if (
    carrier &&
    input.grade === "good" &&
    m.card.scheduleStatus === "review" &&
    now - last < SAME_DAY_MS
  ) {
    return null;
  }

  return review(s, m, input.grade, now, carrier);
};
