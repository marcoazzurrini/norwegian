// Runs a task machine from the engine inside a component.
// The machine decides; this hook keeps its state and carries out the effects it asks for.
import type { Effect, TaskMachine, TaskResult } from "@norsk/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import { applyReviews, getState, teach, updateMeta } from "../../engine/store";
import { speak } from "../../lib/speech";
import type { SpeakOptions } from "../../lib/speech";

type OnDone = (result: TaskResult) => void | Promise<void>;

type SpeakEffect = Extract<Effect, { type: "speak" }>;

const speakOptions = ({ rate, voiceIndex }: SpeakEffect): SpeakOptions => {
  const options: SpeakOptions = {};

  if (rate !== undefined) {
    options.rate = rate;
  }

  if (voiceIndex !== undefined) {
    options.voiceIndex = voiceIndex;
  }

  return options;
};

const countSoundAnswer = async (group: string, right: boolean) => {
  const { sounds } = getState().meta;
  const before = sounds[group] ?? { right: 0, total: 0 };

  await updateMeta({
    sounds: {
      ...sounds,
      [group]: {
        right: before.right + (right ? 1 : 0),
        total: before.total + 1,
      },
    },
  });
};

const markStoryRead = async (id: string) => {
  const read = getState().meta.storiesDone;

  if (!read.includes(id)) {
    await updateMeta({ storiesDone: [...read, id] });
  }
};

/** Carries out one effect. Everything that is saved is awaited, so effects are stored in the order given. */
const perform = async (effect: Effect, onDone: OnDone): Promise<void> => {
  switch (effect.type) {
    case "teach": {
      await teach(effect.ids);
      break;
    }

    case "review": {
      await applyReviews(effect.inputs);
      break;
    }

    case "speak": {
      // Audio is not awaited: the learner can go on while it plays.
      speak(effect.text, speakOptions(effect)).catch(reportError);
      break;
    }

    case "sentenceSeen": {
      await updateMeta({
        sentenceSeen: {
          ...getState().meta.sentenceSeen,
          [effect.id]: effect.at,
        },
      });
      break;
    }

    case "soundAnswered": {
      await countSoundAnswer(effect.group, effect.right);
      break;
    }

    case "storyDone": {
      await markStoryRead(effect.id);
      break;
    }

    case "done": {
      // The session goes on by itself; the task does not wait for it.
      Promise.resolve(onDone(effect.result)).catch(reportError);
      break;
    }

    default: {
      throw new Error(
        `Unknown effect: ${JSON.stringify(effect satisfies never)}`
      );
    }
  }
};

/** Carries out the effects one after another. The first that fails ends the list. */
const performAll = async (
  effects: readonly Effect[],
  onDone: RefObject<OnDone>
): Promise<void> => {
  const [first, ...others] = effects;

  if (first !== undefined) {
    await perform(first, onDone.current);
    await performAll(others, onDone);
  }
};

/** Waits for the work before, whether it ended well or not, and then carries out the effects. */
const performAfter = async (
  before: Promise<void>,
  effects: readonly Effect[],
  onDone: RefObject<OnDone>
): Promise<void> => {
  await before.catch(() => null);
  await performAll(effects, onDone);
};

/**
 * Returns the state of the task and a function that sends it an event.
 * `input` is read once, when the task starts.
 */
export const useTask = <Input, State, Event>(
  machine: TaskMachine<Input, State, Event>,
  input: () => Input,
  onDone: OnDone
): [State, (event: Event) => void] => {
  const [step, setStep] = useState(() => machine.init(input()));
  // What the first step asked for, carried out once the task is on screen.
  const firstEffects = useRef(step.effects);
  // The newest state, so two events in one tick are each applied to the result of the one before.
  const current = useRef(step.state);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const done = useRef(onDone);

  // The caller passes a new function on every render; the newest one is the one to call.
  useEffect(() => {
    done.current = onDone;
  });

  const run = useCallback((effects: readonly Effect[]) => {
    // One effect after another, also across events. A failed event does not block the next one.
    if (effects.length > 0) {
      queue.current = performAfter(queue.current, effects, done);
    }
  }, []);

  useEffect(() => {
    run(firstEffects.current);
  }, [run]);

  const send = useCallback(
    (event: Event) => {
      const next = machine.step(current.current, event, Date.now());

      current.current = next.state;
      setStep(next);
      run(next.effects);
    },
    [machine, run]
  );

  return [step.state, send];
};
