// The answer after a task: audio, the answer in the language of the course, and a line on how it went.
import * as stylex from "@stylexjs/stylex";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  card: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r26 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
    padding: { default: "1.125rem", [stylex.env.desktop]: "1.75rem" },
  },
  text: {
    minWidth: 0,
  },
  words: {
    fontSize: { default: text.s26, [stylex.env.desktop]: text.s44 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    overflowWrap: "break-word",
  },
  note: {
    alignItems: "center",
    color: color.fg2,
    display: "flex",
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
    gap: "0.5rem",
    paddingTop: "0.25rem",
  },
  check: {
    color: color.green,
    flexShrink: 0,
    height: { default: "1rem", [stylex.env.desktop]: "1.125rem" },
    width: { default: "1rem", [stylex.env.desktop]: "1.125rem" },
  },
});

interface AnswerProps {
  /** The control that plays the answer, usually an `AudioButton`. */
  audio: ReactNode;
  /** Shows a green check before the note. */
  good?: boolean;
  /** A line on how it went, or the translation. */
  note: string;
  /** The answer, in the language of the course. */
  children: ReactNode;
}

export const Answer = ({
  audio,
  good = false,
  note,
  children,
}: AnswerProps) => (
  <div {...stylex.props(effects.rise, styles.card)}>
    {audio}
    <div {...stylex.props(styles.text)}>
      <div {...stylex.props(styles.words)}>{children}</div>
      <div {...stylex.props(styles.note)}>
        {good ? <Check {...stylex.props(styles.check)} /> : null}
        {note}
      </div>
    </div>
  </div>
);
