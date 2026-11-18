// What the app asks: a grey bubble on the left, with the thing to translate in large type.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, radius, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  bubble: {
    alignSelf: "flex-start",
    backgroundColor: color.raised,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r28 },
    maxWidth: "100%",
    paddingBlock: { default: "0.75rem", [stylex.env.desktop]: "1.125rem" },
    paddingInline: { default: "1.125rem", [stylex.env.desktop]: "1.75rem" },
  },
  note: {
    color: color.fg2,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s16 },
    paddingBottom: "0.125rem",
  },
  words: {
    fontSize: { default: text.s26, [stylex.env.desktop]: text.s44 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
  },
});

interface AskProps {
  /** A quiet line above the words, such as "Say in Norwegian". */
  note?: string;
  children: ReactNode;
}

export const Ask = ({ note, children }: AskProps) => (
  <div {...stylex.props(styles.bubble)}>
    {note === undefined || note === "" ? null : (
      <div {...stylex.props(styles.note)}>{note}</div>
    )}
    <div {...stylex.props(styles.words)}>{children}</div>
  </div>
);
