// Helpers shared by the tests. Not part of the public interface.
import { lessons, sentences } from "@norsk/content";
import type { Lesson, Sentence } from "@norsk/content";

import type { Step, TaskMachine } from "./index";

/** A fixed moment for tests that need a time. */
export const T0 = Date.UTC(2026, 0, 1, 8);

export const DAY = 86_400_000;

/** Fails the test when a fixture is missing, and narrows the type for the code after it. */
export const must = <Value>(value: Value | null | undefined): Value => {
  if (value === null || value === undefined) {
    throw new Error("A test fixture is missing");
  }

  return value;
};

export const sentenceOf = (no: string): Sentence =>
  must(sentences.find((s) => s.no === no));

export const lessonAt = (index: number): Lesson => must(lessons[index]);

/** The ids of every item taught in the given lessons. */
export const itemsOf = (lessonIndexes: number[]): Set<string> =>
  new Set(lessonIndexes.flatMap((index) => lessonAt(index).items));

/** Starts a task and sends it the events in order. Returns the last state and every effect so far. */
export const play = <Input, State, Event>(
  machine: TaskMachine<Input, State, Event>,
  input: Input,
  events: Event[],
  now = T0
): Step<State> => {
  const first = machine.init(input);
  const effects = [...first.effects];
  let { state } = first;

  for (const event of events) {
    const next = machine.step(state, event, now);
    ({ state } = next);
    effects.push(...next.effects);
  }

  return { effects, state };
};
