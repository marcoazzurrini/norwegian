// A thin bar that shows how much of something is done.
import { Progress as BaseProgress } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { color, motion, radius } from "../tokens/tokens.stylex";

export type ProgressTone = "plain" | "good";

// Both bars are as wide as the track and are moved out of it to the left, so the part that
// stays inside is the value. Moving a bar costs the browser less than changing its width.
const styles = stylex.create({
  track: {
    backgroundColor: color.control,
    borderRadius: radius.pill,
    height: "0.375rem",
    overflow: "hidden",
    position: "relative",
  },
  fill: {
    borderRadius: radius.pill,
    // Above the reach, which starts at the same edge and goes further.
    position: "relative",
    zIndex: 1,
    transitionDuration: motion.move,
    transitionProperty: "transform",
    transitionTimingFunction: motion.easeOut,
  },
});

const reachStyles = stylex.create({
  reach: {
    backgroundColor: color.yellow,
    borderRadius: radius.pill,
    inset: 0,
    position: "absolute",
    transitionDuration: motion.move,
    transitionProperty: "transform",
    transitionTimingFunction: motion.easeOut,
  },
});

const tones = stylex.create({
  plain: { backgroundColor: color.fg },
  good: { backgroundColor: color.green },
});

interface ProgressProps {
  /** From 0 to 1. Values outside that range are clamped. */
  value: number;
  tone?: ProgressTone;
  /**
   * From 0 to 1. A second, paler bar behind the first: how far the learner has gone,
   * while `value` says how much of that is solid. It is decoration, so the text
   * next to the bar has to say the number.
   */
  reach?: number;
  /**
   * From 0 to 1. The bar starts here and moves to `value`. For a bar that takes the place
   * of one on the screen before, so that the two look like one bar that goes on.
   */
  from?: number | undefined;
  /** Applies to the track: its height, width, or place in a layout. */
  style?: StyleXStyles;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

/** Leaves `part` of a bar inside the track. */
const shift = (part: number): string => `translateX(${(part - 1) * 100}%)`;

export const Progress = ({
  value,
  tone = "plain",
  reach,
  from,
  style,
}: ProgressProps) => {
  const part = clamp(value);

  // A bar with a `from` is first drawn there. One frame later it gets its value,
  // and the transition carries it over.
  const [moved, setMoved] = useState(from === undefined);

  useEffect(() => {
    const frame = moved
      ? undefined
      : requestAnimationFrame(() => {
          setMoved(true);
        });

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    };
  }, [moved]);

  const shown = moved || from === undefined ? part : clamp(from);

  // Assistive technology hears a whole percentage. The fill keeps the exact value, so the
  // bar moves smoothly: its own `style` replaces the width that Base UI gives it.
  return (
    <BaseProgress.Root
      value={Math.round(part * 100)}
      {...stylex.props(styles.track, style)}
    >
      <BaseProgress.Indicator
        style={{ transform: shift(shown), width: "100%" }}
        {...stylex.props(styles.fill, tones[tone])}
      />
      {reach === undefined ? null : (
        <div
          aria-hidden="true"
          style={{ transform: shift(clamp(reach)) }}
          {...stylex.props(reachStyles.reach)}
        />
      )}
    </BaseProgress.Root>
  );
};
