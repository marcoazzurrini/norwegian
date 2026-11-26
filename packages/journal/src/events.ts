// Every event the journal can hold, and what describes each one.
//
// This is the one list of what the app notes. An event that is not here cannot be noted, and
// whoever reads the journal on the server finds here what each kind of event carries.
// To note something new, add it here first.
import type {
  Choice,
  Pace,
  ReviewInput,
  SessionStats,
  Task,
  TaskResult,
} from "@norsk/engine";
import type { ExplainRequest } from "@norsk/protocol";

/** How a session stood when it ended or was left. */
export type SessionTotals = SessionStats & {
  /** Time studied so far, in milliseconds. */
  elapsedMs: number;
  /** The session ran out of time before it had recalled all it owed. */
  timeUp: boolean;
};

/** What a task was about: its kind and the ids of what it used. Never the texts. */
export type TaskIds =
  | { task: "sound"; group: string; target: "a" | "b" }
  | { task: "intro"; items: string[] }
  | { task: "pattern"; item: string; practice: string[] }
  | { task: "card"; item: string; reason: "learning" | "review" }
  | { task: "sentence"; sentence: string; covers: string[] }
  | { task: "story"; story: string }
  | { task: "done" };

// oxlint-disable-next-line typescript/consistent-type-definitions -- a type alias can be stored as plain data; an interface cannot
export type Events = {
  /** A session began in this course, for this many minutes, with the learner's pace at that moment. */
  "session.started": { course: string; minutes: number; pace: Pace };
  /** A session reached its end. */
  "session.ended": SessionTotals;
  /** The learner left a session before its end. */
  "session.left": SessionTotals;
  /** The session chose its next task: which one, and why. `count` numbers the tasks of a session. */
  "task.chosen": Choice & TaskIds & { count: number };
  /**
   * What the learner did in a task, as the task was told it: an answer typed, a hint asked for.
   * Each kind of task has its own events, so the journal does not describe them.
   */
  "task.event": { event: unknown };
  /** New items were recorded as learned. */
  "task.taught": { ids: string[] };
  /** Answers were recorded for items the learner already has. */
  "task.reviewed": { inputs: ReviewInput[] };
  /** A task ended: what it reported, how long it took, and how much of that time counted. */
  "task.done": TaskResult & { count: number; countedMs: number; ms: number };
  /**
   * The learner asked for an explanation and got this text after `ms` milliseconds.
   * `text` is null when no explanation could be given.
   */
  explain: { ms: number; request: ExplainRequest; text: string | null };
};

export type EventKind = keyof Events;

/** The ids of what a task used. */
export const taskIds = (task: Task): TaskIds => {
  switch (task.type) {
    case "sound": {
      return { group: task.pair.group, target: task.target, task: "sound" };
    }

    case "intro": {
      return { items: task.items.map((item) => item.id), task: "intro" };
    }

    case "pattern": {
      return {
        item: task.item.id,
        practice: task.practice.map((sentence) => sentence.id),
        task: "pattern",
      };
    }

    case "card": {
      return { item: task.item.id, reason: task.reason, task: "card" };
    }

    case "sentence": {
      return {
        covers: task.covers,
        sentence: task.sentence.id,
        task: "sentence",
      };
    }

    case "story": {
      return { story: task.story.id, task: "story" };
    }

    case "done": {
      return { task: "done" };
    }

    default: {
      return task satisfies never;
    }
  }
};
