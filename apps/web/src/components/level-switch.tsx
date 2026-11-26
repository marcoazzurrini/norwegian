// The choice of a level, on the pages that show one level at a time.
import type { Level } from "@norsk/course";
import { currentLevel, levelState } from "@norsk/engine";
import type { LevelState, Memory } from "@norsk/engine";
import { Segmented } from "@norsk/ui";
import { color } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { useCourse } from "../course";

const styles = stylex.create({
  // On a wide screen the switch is as tall as the search field beside it.
  group: {
    display: { default: "flex", [stylex.env.desktop]: "inline-flex" },
    flexShrink: 0,
    // Stays at the right end of the title row, also when it goes under the title.
    marginLeft: { default: null, [stylex.env.desktop]: "auto" },
    padding: { default: "0.25rem", [stylex.env.desktop]: "0.375rem" },
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  mark: {
    flexShrink: 0,
    height: "1rem",
    width: "1rem",
  },
  done: {
    color: color.green,
  },
});

const mark = (state: LevelState): ReactNode => {
  if (state === "done") {
    return <Check aria-hidden {...stylex.props(styles.mark, styles.done)} />;
  }

  return state === "locked" ? (
    <Lock aria-hidden {...stylex.props(styles.mark)} />
  ) : null;
};

/**
 * The level a page shows, and a way to pick another. Until the learner picks one,
 * it is the level they are in, so it moves on by itself when they finish a level.
 */
export const useLevel = (
  memory: Memory
): readonly [Level, (id: string) => void] => {
  const course = useCourse();
  const [picked, setPicked] = useState<string | null>(null);

  const level =
    course.levels.find((one) => one.id === picked) ??
    currentLevel(course, memory);

  return [level, setPicked];
};

interface LevelSwitchProps {
  level: Level;
  memory: Memory;
  onPick: (id: string) => void;
}

/** One option for each level, in the order they are learned. A locked level cannot be picked. */
export const LevelSwitch = ({ level, memory, onPick }: LevelSwitchProps) => {
  const course = useCourse();

  const states = course.levels.map(
    (one) => [one, levelState(course, one, memory)] as const
  );

  return (
    <Segmented
      large
      stretch
      label="Level"
      value={level.id}
      options={states.map(
        ([one, state]) =>
          [
            one.id,
            <>
              {mark(state)}
              {one.id}
            </>,
          ] as const
      )}
      disabled={states.flatMap(([one, state]) =>
        state === "locked" ? [one.id] : []
      )}
      onPick={onPick}
      style={styles.group}
    />
  );
};
