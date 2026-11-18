// Runs a task machine from the engine inside a component.
// The machine decides; this hook keeps its state and carries out the effects it asks for.
import type { Effect, TaskMachine, TaskResult } from "@norsk/engine";
import { useCallback, useEffect, useRef, useState } from "react";

import { applyReviews, getState, teach, updateMeta } from "../../engine/store";
import { speak } from "../../lib/speech";

type OnDone = (result: TaskResult) => void | Promise<void>;

/** Carries out one effect. Everything that is saved is awaited, so effects are stored in the order given. */
async function perform(effect: Effect, onDone: OnDone): Promise<void> {
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
      void speak(effect.text, {
        ...(effect.rate !== undefined && { rate: effect.rate }),
        ...(effect.voiceIndex !== undefined && {
          voiceIndex: effect.voiceIndex,
        }),
      });
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
      const { sounds } = getState().meta;
      const s = sounds[effect.group] ?? { right: 0, total: 0 };
      await updateMeta({
        sounds: {
          ...sounds,
          [effect.group]: {
            right: s.right + (effect.right ? 1 : 0),
            total: s.total + 1,
          },
        },
      });
      break;
    }

    case "storyDone": {
      const done = getState().meta.storiesDone;

      if (!done.includes(effect.id)) {
        await updateMeta({ storiesDone: [...done, effect.id] });
      }

      break;
    }

    case "done": {
      void onDone(effect.result);
      break;
    }
  }
}

/**
 * Returns the state of the task and a function that sends it an event.
 * `input` is read once, when the task starts.
 */
export function useTask<Input, State, Event>(
  machine: TaskMachine<Input, State, Event>,
  input: () => Input,
  onDone: OnDone
): [State, (event: Event) => void] {
  const [first] = useState(() => machine.init(input()));
  const [state, setState] = useState(first.state);
  // The newest state, so two events in one tick are each applied to the result of the one before.
  const current = useRef(first.state);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const done = useRef(onDone);
  done.current = onDone;

  const run = useCallback((effects: Effect[]) => {
    if (!effects.length) {
      return;
    }

    // One effect after another, also across events. A failed effect does not block the ones after it.
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        for (const effect of effects) {
          await perform(effect, done.current);
        }
      });
  }, []);

  useEffect(() => {
    run(first.effects);
  }, [first, run]);

  const send = useCallback(
    (event: Event) => {
      const next = machine.step(current.current, event, Date.now());
      current.current = next.state;
      setState(next.state);
      run(next.effects);
    },
    [machine, run]
  );

  return [state, send];
}
