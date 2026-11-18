// What the Today screen says: the greeting, the numbers, and one line for each part of a session.
import { item, items, units } from "@norsk/content";
import type { Item, Lesson, Story } from "@norsk/content";
import {
  compression,
  dueItems,
  isStable,
  nextLesson,
  nextStory,
  retrievability,
} from "@norsk/engine";
import type { Compression, Memory, Scheduler } from "@norsk/engine";

/** Hours a solo learner needs to reach A1 (docs/spec.md, section 4). */
export const HOURS_TO_A1 = 100;

const MS_PER_HOUR = 3_600_000;

export interface Greeting {
  norwegian: string;
  english: string;
}

export const greetingAt = (hour: number): Greeting => {
  if (hour < 10) {
    return { english: "Good morning", norwegian: "God morgen" };
  }

  if (hour < 18) {
    return { english: "Good day", norwegian: "God dag" };
  }

  return { english: "Good evening", norwegian: "God kveld" };
};

const reviewsText = (due: number): string =>
  `${due} ${due === 1 ? "review" : "reviews"}`;

const newText = (firstNew: Item | null): string => {
  if (firstNew === null) {
    return "";
  }

  return firstNew.kind === "pattern" ? "one new pattern" : "new words";
};

/** One line that says what today holds. */
export const summaryOf = (due: number, firstNew: Item | null): string => {
  const parts = [due > 0 ? reviewsText(due) : "", newText(firstNew)].filter(
    (part) => part !== ""
  );

  if (parts.length === 0) {
    return "Nothing is due right now.";
  }

  return `${parts.join(" and ")}${due > 0 ? "" : " to learn"}.`;
};

export const reviewDetail = (due: number, cover: Compression): string => {
  if (due === 0) {
    return "Nothing is due.";
  }

  const covered =
    cover.due > 1 && cover.tasks < cover.due
      ? ` ${cover.tasks} reviews cover ${cover.due} of them.`
      : "";

  return `${due} ${due === 1 ? "item is" : "items are"} due.${covered}`;
};

const firstNewText = (firstNew: Item | null): string => {
  if (firstNew === null) {
    return "";
  }

  return firstNew.kind === "pattern"
    ? ` Pattern: ${firstNew.title ?? ""}.`
    : ` Next: ${firstNew.display}.`;
};

export const newDetail = (
  lesson: Lesson | null,
  firstNew: Item | null
): string => {
  if (lesson === null) {
    return "You have learned every lesson.";
  }

  const unit = units[lesson.unit - 1]?.name ?? "";

  return `Unit ${lesson.unit}, ${unit}: ${lesson.title}.${firstNewText(firstNew)}`;
};

export const storyDetail = (story: Story | null): string =>
  story === null
    ? "A story unlocks after a few more lessons."
    : `${story.title}. Made from words you know.`;

export interface TodayInput {
  memory: Memory;
  chosenLesson: number | null;
  storiesDone: readonly string[];
  /** Active study time so far, in milliseconds. */
  totalMs: number;
  now: number;
  scheduler: Scheduler;
}

export interface TodayView {
  summary: string;
  reviewDetail: string;
  newDetail: string;
  storyDetail: string;
  /** Progress to A1, from 0 up. */
  progress: number;
  hours: number;
  stable: number;
  learning: number;
  toLearn: number;
  /** The share of learned items the learner would recall now, as text. */
  recall: string;
}

const averageRecall = (
  memory: Memory,
  scheduler: Scheduler,
  now: number
): number => {
  const all = [...memory.values()];

  const sum = all.reduce(
    (total, mem) => total + retrievability(scheduler, mem, now),
    0
  );

  return all.length === 0 ? 0 : sum / all.length;
};

export const todayOf = ({
  memory,
  chosenLesson,
  storiesDone,
  totalMs,
  now,
  scheduler,
}: TodayInput): TodayView => {
  const all = [...memory.values()];
  const lesson = nextLesson(memory, chosenLesson);
  const firstId = lesson?.items.find((id) => !memory.has(id));
  const firstNew = firstId === undefined ? null : item(firstId);
  const cover = compression(memory, now);
  const due = cover.due + dueItems(memory, now).learning.length;
  const stable = all.filter((mem) => isStable(mem)).length;
  const hours = totalMs / MS_PER_HOUR;

  return {
    hours,
    learning: all.length - stable,
    newDetail: newDetail(lesson, firstNew),
    progress: hours / HOURS_TO_A1,
    recall:
      all.length === 0
        ? "–"
        : `${Math.round(averageRecall(memory, scheduler, now) * 100)}%`,
    reviewDetail: reviewDetail(due, cover),
    stable,
    storyDetail: storyDetail(nextStory(memory, new Set(storiesDone))),
    summary: summaryOf(due, firstNew),
    toLearn: Object.keys(items).length - memory.size,
  };
};
