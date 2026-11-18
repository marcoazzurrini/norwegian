// A short note with the main action. On a phone the note sits above a full-width button.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  row: {
    alignItems: { default: "stretch", [stylex.env.desktop]: "center" },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: { default: "0.75rem", [stylex.env.desktop]: "1rem" },
    justifyContent: { default: null, [stylex.env.desktop]: "space-between" },
  },
  hint: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    textAlign: { default: "center", [stylex.env.desktop]: "left" },
  },
});

interface DockHintProps {
  hint?: string;
  /** The main action. */
  children: ReactNode;
}

export const DockHint = ({ hint, children }: DockHintProps) => (
  <div {...stylex.props(styles.row)}>
    <span {...stylex.props(styles.hint)}>{hint}</span>
    {children}
  </div>
);
