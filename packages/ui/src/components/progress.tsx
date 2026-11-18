// A thin bar that shows how much of something is done.
import { Progress as BaseProgress } from "@base-ui/react/progress";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { color, motion, radius } from "../tokens/tokens.stylex";

export type ProgressTone = "plain" | "good";

const styles = stylex.create({
  track: {
    backgroundColor: color.control,
    borderRadius: radius.pill,
    height: "0.375rem",
    overflow: "hidden",
  },
  fill: {
    borderRadius: radius.pill,
    transitionDuration: motion.fill,
    transitionProperty: "width",
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
  /** Applies to the track: its height, width, or place in a layout. */
  style?: StyleXStyles;
}

export const Progress = ({ value, tone = "plain", style }: ProgressProps) => {
  const part = Math.max(0, Math.min(1, value));

  // Assistive technology hears a whole percentage. The fill keeps the exact value, so the
  // bar moves smoothly: its own `style` replaces the rounded width that Base UI gives it.
  return (
    <BaseProgress.Root
      value={Math.round(part * 100)}
      {...stylex.props(styles.track, style)}
    >
      <BaseProgress.Indicator
        style={{ width: `${part * 100}%` }}
        {...stylex.props(styles.fill, tones[tone])}
      />
    </BaseProgress.Root>
  );
};
