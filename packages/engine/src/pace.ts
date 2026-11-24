// How long the learner takes for each kind of work. A session plans its time with this:
// it starts a task only if there is time for it and for what the task commits the session to.

/** The kinds of work a session plans time for. */
export type PaceKind = "card" | "sentence" | "intro" | "pattern" | "story";

/**
 * The latest times of each kind of work, in milliseconds, oldest first.
 * One card, one sentence, one pattern and one story are a time each. New words and phrases
 * are taught in groups of different sizes, so "intro" is the time for one item of a group.
 */
export type Pace = Readonly<Partial<Record<PaceKind, readonly number[]>>>;

/** How many of the latest times are kept for each kind of work. */
const KEPT = 20;

/**
 * Used for a kind of work the learner has not done yet. These are nobody's times, only a place
 * to start: the learner's own times replace them from the first task on.
 */
const STARTING_MS: Readonly<Record<PaceKind, number>> = {
  card: 8000,
  intro: 15_000,
  pattern: 90_000,
  sentence: 20_000,
  story: 120_000,
};

/**
 * The time one piece of this kind of work usually takes: the middle one of the latest times.
 * The middle is used, not the mean, so that one task left open during a break changes nothing.
 */
export const typicalMs = (pace: Pace, kind: PaceKind): number => {
  const sorted = (pace[kind] ?? []).toSorted((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  const below = sorted[Math.floor((sorted.length - 1) / 2)];

  return middle === undefined || below === undefined
    ? STARTING_MS[kind]
    : (middle + below) / 2;
};

/** The pace with one more time for a kind of work. */
export const withTime = (pace: Pace, kind: PaceKind, ms: number): Pace => ({
  ...pace,
  [kind]: [...(pace[kind] ?? []), ms].slice(-KEPT),
});
