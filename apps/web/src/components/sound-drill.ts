// The Sounds screen as data: the pairs by the contrast they train, and a run of practice questions.
import type { SoundPair } from "@norsk/course";

import { shuffled } from "./tasks/items";

/** How many questions one run of practice has. */
export const DRILL_LENGTH = 10;

export interface SoundGroup {
  id: string;
  title: string;
  hint: string;
  pairs: SoundPair[];
}

/** The pairs under their contrast, in the order the contrasts first appear. */
export const soundGroups = (pairs: readonly SoundPair[]): SoundGroup[] => {
  const groups = new Map<string, SoundGroup>();

  for (const pair of pairs) {
    const group = groups.get(pair.group) ?? {
      hint: pair.hint,
      id: pair.group,
      pairs: [],
      title: pair.groupTitle,
    };

    groups.set(pair.group, { ...group, pairs: [...group.pairs, pair] });
  }

  return [...groups.values()];
};

export interface DrillQuestion {
  pair: SoundPair;
  /** The word that is played. */
  target: "a" | "b";
}

/**
 * A run of practice questions from the given pairs.
 * `random` returns a number from 0 up to, but not including, 1.
 */
export const drillFrom = (
  pairs: readonly SoundPair[],
  random: () => number
): DrillQuestion[] => {
  const picked = Array.from(
    { length: DRILL_LENGTH },
    (_, at) => shuffled(pairs, random)[at % pairs.length]
  ).filter((pair) => pair !== undefined);

  return picked.map((pair) => ({ pair, target: random() < 0.5 ? "a" : "b" }));
};

/** What the device can do for ear training, in one sentence. `language` is the language of the course, such as "Norwegian". */
export const voicesNote = (
  names: readonly string[],
  language: string
): string => {
  const [only] = names;

  if (only === undefined) {
    return `No ${language} voice is installed on this device. Add one in the system settings.`;
  }

  return names.length === 1
    ? `This device has one ${language} voice (${only}). Ear training works best with several voices.`
    : `This device has ${names.length} ${language} voices. The drill switches between them.`;
};
