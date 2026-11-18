// What a session says about itself: the time left while it runs, and the numbers when it ends.
import type { Session } from "@norsk/engine";

const MS_PER_MINUTE = 60_000;
const DEFAULT_MINUTES = 15;
const LONGEST_MINUTES = 120;

/** The session length asked for in the address, kept between one minute and two hours. */
export const sessionMinutes = (asked: number): number =>
  Math.min(
    LONGEST_MINUTES,
    Math.max(1, Number.isNaN(asked) || asked === 0 ? DEFAULT_MINUTES : asked)
  );

type SessionTimes = Pick<Session, "budgetMs" | "elapsedMs">;

/** Whole minutes left, rounded up, and never below zero. */
export const minutesLeft = ({ budgetMs, elapsedMs }: SessionTimes): number =>
  Math.max(0, Math.ceil((budgetMs - elapsedMs) / MS_PER_MINUTE));

export interface Tile {
  value: string | number;
  label: string;
}

export interface SessionSummary {
  /** Whole minutes spent, at least one. */
  spent: number;
  /** Why the session ended. */
  closing: string;
  tiles: Tile[];
  /** True if something new was taught, which comes back soon. */
  taughtNew: boolean;
}

export const summaryOf = ({
  budgetMs,
  elapsedMs,
  stats,
}: Pick<Session, "budgetMs" | "elapsedMs" | "stats">): SessionSummary => {
  const answered = stats.right + stats.wrong;
  const spent = Math.max(1, Math.round(elapsedMs / MS_PER_MINUTE));

  return {
    closing:
      elapsedMs >= budgetMs
        ? "Finished. Your time is up."
        : "Finished. Nothing more is due right now.",
    spent,
    taughtNew: stats.taught > 0,
    tiles: [
      { label: spent === 1 ? "minute" : "minutes", value: spent },
      { label: "new items", value: stats.taught },
      { label: "items reviewed", value: stats.reviewed },
      {
        label: "right first time",
        value:
          answered === 0
            ? "–"
            : `${Math.round((stats.right / answered) * 100)}%`,
      },
    ],
  };
};
