// What the Today screen says: the greeting, the numbers, and one line for each part of a session.
import type {
  Course,
  Greetings,
  Item,
  Lesson,
  Level,
  Story,
} from "@norsk/course";
import {
  compression,
  currentLevel,
  dueItems,
  isStable,
  levelState,
  nextLesson,
  nextStory,
  retrievability,
  strength,
} from "@norsk/engine";
import type {
  Compression,
  LevelState,
  Mem,
  Memory,
  Scheduler,
} from "@norsk/engine";

export interface Greeting {
  /** The greeting in the language of the course. */
  target: string;
  /** What it means. */
  base: string;
}

/** The greeting for an hour of the day, in the words of the course. */
export const greetingAt = (hour: number, greetings: Greetings): Greeting => {
  if (hour < 10) {
    return { base: "Good morning", target: greetings.morning };
  }

  if (hour < 18) {
    return { base: "Good day", target: greetings.day };
  }

  return { base: "Good evening", target: greetings.evening };
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
  course: Course,
  lesson: Lesson | null,
  firstNew: Item | null
): string => {
  if (lesson === null) {
    return "You have learned every lesson.";
  }

  const unit = course.units[lesson.unit - 1]?.name ?? "";

  return `Unit ${lesson.unit}, ${unit}: ${lesson.title}.${firstNewText(firstNew)}`;
};

export const storyDetail = (story: Story | null): string =>
  story === null
    ? "A story unlocks after a few more lessons."
    : `${story.title}. Made from words you know.`;

export interface TodayInput {
  course: Course;
  memory: Memory;
  chosenLesson: number | null;
  storiesDone: readonly string[];
  /** When each sentence was last used as a review. */
  sentenceSeen: Readonly<Record<string, number>>;
  now: number;
  scheduler: Scheduler;
}

/** One level of the course, as a step on the way. */
export interface LevelStep {
  id: string;
  state: LevelState;
  /** From 0 to 1: how well the items of the level are known. */
  progress: number;
}

export interface TodayView {
  summary: string;
  reviewDetail: string;
  newDetail: string;
  storyDetail: string;
  /** The level the learner is in. The numbers below are about this level, except `recall`. */
  level: Level;
  /** Every level of the course, in the order they are learned. */
  levels: LevelStep[];
  /**
   * Progress to the end of the level, from 0 to 1: how well its items are known. An item
   * counts from its first recall and in full once it is stable, so the number moves
   * with every review and reaches 1 only when everything holds.
   */
  progress: number;
  /** Items of the level met at least once. */
  seen: number;
  /** Every item of the level. */
  total: number;
  stable: number;
  learning: number;
  toLearn: number;
  /** The share of everything learned, in any level, that the learner would recall now, as text. */
  recall: string;
}

const averageRecall = (
  mems: Mem[],
  scheduler: Scheduler,
  now: number
): number => {
  const sum = mems.reduce(
    (total, mem) => total + retrievability(scheduler, mem, now),
    0
  );

  return mems.length === 0 ? 0 : sum / mems.length;
};

/** How well the items of a level are known, from 0 to 1. A level without items counts as 0. */
const levelProgress = (mems: Mem[], total: number): number =>
  total === 0 ? 0 : mems.reduce((sum, mem) => sum + strength(mem), 0) / total;

export const todayOf = ({
  course,
  memory,
  chosenLesson,
  storiesDone,
  sentenceSeen,
  now,
  scheduler,
}: TodayInput): TodayView => {
  const lesson = nextLesson(course, memory, chosenLesson);
  const firstId = lesson?.items.find((id) => !memory.has(id));
  const firstNew = firstId === undefined ? null : course.item(firstId);
  const cover = compression(course, memory, now, sentenceSeen);
  // What is due is counted over everything learned: a review does not stop at the end of a level.
  const due = cover.due + dueItems(memory, now).learning.length;
  const level = currentLevel(course, memory);
  const all = [...memory.values()];

  const memsOf = (one: Level): Mem[] =>
    course.levelItems(one).flatMap((id) => memory.get(id) ?? []);

  const inLevel = memsOf(level);
  const total = course.levelItems(level).length;
  const stable = inLevel.filter((mem) => isStable(mem)).length;

  return {
    learning: inLevel.length - stable,
    level,
    levels: course.levels.map((one) => ({
      id: one.id,
      progress: levelProgress(memsOf(one), course.levelItems(one).length),
      state: levelState(course, one, memory),
    })),
    newDetail: newDetail(course, lesson, firstNew),
    progress: levelProgress(inLevel, total),
    recall:
      all.length === 0
        ? "–"
        : `${Math.round(averageRecall(all, scheduler, now) * 100)}%`,
    reviewDetail: reviewDetail(due, cover),
    seen: inLevel.length,
    stable,
    storyDetail: storyDetail(nextStory(course, memory, new Set(storiesDone))),
    summary: summaryOf(due, firstNew),
    toLearn: total - inLevel.length,
    total,
  };
};
