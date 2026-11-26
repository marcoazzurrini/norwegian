// Minimal-pair listening: one of two similar words is played, and the learner picks which.
import type { SoundPair } from "@norsk/course";

import { EMPTY_RESULT, stay } from "./types";
import type { Effect, Step, TaskMachine } from "./types";

export type Side = "a" | "b";

export interface SoundInput {
  pair: SoundPair;
  /** The word that is played. */
  target: Side;
  /** Position in the drill, used to change the speaker from one question to the next. */
  index: number;
}

export interface SoundState {
  pair: SoundPair;
  target: Side;
  index: number;
  picked: Side | null;
  /** The pick was the word that was played. */
  right: boolean;
  done: boolean;
}

export type SoundEvent =
  /** Play the word again. Also sent once when the question appears. */
  | { type: "play" }
  /** A word was tapped: the pick, or after the pick a way to hear that word. */
  | { type: "tap"; side: Side }
  /** A word was chosen with the keyboard. It never plays audio. */
  | { type: "key"; side: Side }
  | { type: "continue" };

/** A little slower than normal speech, so the difference between the two words can be heard. */
const DRILL_RATE = 0.8;

const say = (state: SoundState, side: Side): Effect => ({
  rate: DRILL_RATE,
  text: state.pair[side].word,
  type: "speak",
  voiceIndex: state.index,
});

const init = ({ index, pair, target }: SoundInput): Step<SoundState> =>
  stay({ done: false, index, pair, picked: null, right: false, target });

const pick = (state: SoundState, side: Side): Step<SoundState> => {
  const right = side === state.target;

  return {
    effects: [{ group: state.pair.group, right, type: "soundAnswered" }],
    state: { ...state, picked: side, right },
  };
};

const finish = (state: SoundState): Step<SoundState> => ({
  effects: [
    {
      result: {
        ...EMPTY_RESULT,
        right: state.right ? 1 : 0,
        wrong: state.right ? 0 : 1,
      },
      type: "done",
    },
  ],
  state: { ...state, done: true },
});

const step = (state: SoundState, event: SoundEvent): Step<SoundState> => {
  if (state.done) {
    return stay(state);
  }

  if (event.type === "play") {
    return { effects: [say(state, state.target)], state };
  }

  if (event.type === "continue") {
    return state.picked === null ? stay(state) : finish(state);
  }

  if (state.picked === null) {
    return pick(state, event.side);
  }

  return event.type === "tap"
    ? { effects: [say(state, event.side)], state }
    : stay(state);
};

export const soundTask: TaskMachine<SoundInput, SoundState, SoundEvent> = {
  init,
  step,
};
