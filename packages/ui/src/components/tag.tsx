// A small pill with an icon, for the state of a thing: learned, in progress, new, wrong, locked.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { Check, CircleDashed, Lock, Sparkles, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { color, radius, text } from "../tokens/tokens.stylex";

export type TagTone = "good" | "progress" | "new" | "bad" | "neutral";

const styles = stylex.create({
  tag: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    display: "inline-flex",
    flexShrink: 0,
    fontSize: text.s13,
    fontWeight: 500,
    gap: "0.375rem",
    height: "1.625rem",
    paddingLeft: "0.5rem",
    paddingRight: "0.625rem",
    whiteSpace: "nowrap",
  },
  icon: {
    height: "0.875rem",
    width: "0.875rem",
  },
});

const tones = stylex.create({
  good: { color: color.green },
  progress: { color: color.orange },
  new: { color: color.violet },
  bad: { color: color.red },
  neutral: { color: color.fg3 },
});

const ICON: Record<TagTone, LucideIcon> = {
  bad: X,
  good: Check,
  neutral: Lock,
  new: Sparkles,
  progress: CircleDashed,
};

interface TagProps {
  tone?: TagTone;
  /** Replaces the icon of the tone. */
  icon?: LucideIcon;
  children: ReactNode;
  style?: StyleXStyles;
}

export const Tag = ({ tone = "neutral", icon, children, style }: TagProps) => {
  const Icon = icon ?? ICON[tone];

  return (
    <span {...stylex.props(styles.tag, style)}>
      <Icon {...stylex.props(styles.icon, tones[tone])} />
      {children}
    </span>
  );
};
