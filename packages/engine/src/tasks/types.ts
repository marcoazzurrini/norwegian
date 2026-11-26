// What every task machine has in common.
//
// A machine holds the decisions of one task: which phase it is in, what counts as failed,
// and what must be recorded. It never does anything itself. `init` and `step` return the
// next state plus a list of effects, and the app carries the effects out in order.
import type { ReviewInput } from "../memory";

/** What a finished task reports back to the session. */
export interface TaskResult {
  /** The items the task exercised. */
  itemIds: string[];
  /** Items the learner got right the first time. */
  right: number;
  wrong: number;
  /** Items that are new to the learner. */
  taught: number;
}

export const EMPTY_RESULT: TaskResult = {
  itemIds: [],
  right: 0,
  taught: 0,
  wrong: 0,
};

/** Something the app must do for a task. Effects are plain data. */
export type Effect =
  /** Record the first successful recall of new items. */
  | { type: "teach"; ids: string[] }
  /** Record answers for items the learner already has. */
  | { type: "review"; inputs: ReviewInput[] }
  /** Play audio in the language of the course. The app does not wait for it to end. */
  | { type: "speak"; text: string; voiceIndex?: number; rate?: number }
  /** Remember when a sentence was last used as a review. */
  | { type: "sentenceSeen"; id: string; at: number }
  /** Count one answer in the statistics of a sound group. */
  | { type: "soundAnswered"; group: string; right: boolean }
  /** Mark a story as read. */
  | { type: "storyDone"; id: string }
  /** The task is over. Always the last effect of a task. */
  | { type: "done"; result: TaskResult };

export interface Step<State> {
  state: State;
  effects: Effect[];
}

/**
 * The shape of every task machine.
 * `now` is the time of the event in milliseconds; a machine never reads the clock itself.
 */
export interface TaskMachine<Input, State, Event> {
  init: (input: Input) => Step<State>;
  step: (state: State, event: Event, now: number) => Step<State>;
}

/** The event changes nothing. */
export const stay = <State>(state: State): Step<State> => ({
  effects: [],
  state,
});
