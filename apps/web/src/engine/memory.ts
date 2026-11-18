// Memory model: one FSRS card per item (see docs/spec.md, section 2).
import { DefaultScheduler, Rating } from "ts-fsrs";

/** The FSRS-6 memory state of one item, as ts-fsrs stores it. */
export interface Card {
  cardId: string | number;
  /** Days until the chance of recall drops to 90%. */
  stability: number;
  difficulty: number;
  dueAt: Date;
  lastReviewAt: Date | null;
  scheduleStatus: "new" | "learning" | "review";
  state: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  learningStep: number;
}

type MemoryState = Pick<Card, "stability" | "difficulty">;

/** The part of the ts-fsrs scheduler this app uses. Its own types cover every FSRS version at once. */
export interface Scheduler {
  newCard(input: { now: Date }): Card;
  review(input: { card: Card; grade: Rating; now: Date }): { card: Card };
  model: {
    forgettingCurve(state: MemoryState, elapsedDays: number): number;
    nextInterval(state: MemoryState, desiredRetention: number): number;
  };
}

export interface Mem {
  id: string;
  card: Card;
  introducedAt: number;
}

export type Grade = "again" | "good";

/** Share of the stability gain an item keeps when it was recalled inside a sentence, where context helps. */
export const CARRIER_CREDIT = 0.8;

/** Items at or above this stability (in days) count as stable. */
export const STABLE_DAYS = 21;

/** Below this stability (in days), a word or chunk is reviewed on its own card, not inside a sentence. */
export const CARRIER_MIN_DAYS = 3;

const DAY = 86_400_000;

const retentionOf = new WeakMap<Scheduler, number>();

export async function createScheduler(
  desiredRetention: number
): Promise<Scheduler> {
  const scheduler = (await DefaultScheduler({
    version: "FSRS-6",
    desiredRetention,
    enableShortTerm: true,
    learningSteps: ["1m", "5m", "15m"],
    relearningSteps: ["5m"],
    enableFuzz: false,
  })) as unknown as Scheduler;

  retentionOf.set(scheduler, desiredRetention);

  return scheduler;
}

export const isLearning = (m: Mem) => m.card.scheduleStatus !== "review";

export const isDue = (m: Mem, now: number) =>
  new Date(m.card.dueAt).getTime() <= now;

export const isStable = (m: Mem) =>
  !isLearning(m) && m.card.stability >= STABLE_DAYS;

/** Chance, from 0 to 1, that the item would be recalled right now. */
export function retrievability(s: Scheduler, m: Mem, now: number): number {
  if (!m.card.lastReviewAt) {
    return 0;
  }

  const elapsed = Math.max(
    0,
    (now - new Date(m.card.lastReviewAt).getTime()) / DAY
  );

  return s.model.forgettingCurve(m.card, elapsed);
}

/** First successful recall of a new item. */
export function introduce(s: Scheduler, id: string, now: number): Mem {
  const fresh = s.newCard({ now: new Date(now) });

  const { card } = s.review({
    card: fresh,
    grade: Rating.Good,
    now: new Date(now),
  });

  return { id, card, introducedAt: now };
}

/**
 * Applies one review.
 * `carrier` marks a recall made inside a sentence: a pass then keeps only part of its stability gain.
 */
export function review(
  s: Scheduler,
  m: Mem,
  grade: Grade,
  now: number,
  carrier = false
): Mem {
  const before = m.card;

  const { card } = s.review({
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
      Math.round(s.model.nextInterval(adjusted, retentionOf.get(s) ?? 0.9))
    );

    return {
      ...m,
      card: {
        ...adjusted,
        scheduledDays: days,
        dueAt: new Date(now + days * DAY),
      },
    };
  }

  return { ...m, card };
}
