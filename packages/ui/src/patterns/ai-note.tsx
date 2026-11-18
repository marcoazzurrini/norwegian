// Text written by the language model. It is labelled, so it is never mistaken for the app's own checking.
import * as stylex from "@stylexjs/stylex";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  note: {
    alignSelf: "flex-start",
    backgroundColor: color.raised,
    borderRadius: { default: radius.r22, [stylex.env.desktop]: radius.r28 },
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.375rem", [stylex.env.desktop]: "0.5rem" },
    maxWidth: { default: "100%", [stylex.env.desktop]: "45rem" },
    paddingBlock: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
    paddingInline: { default: "1.125rem", [stylex.env.desktop]: "1.75rem" },
  },
  label: {
    alignItems: "center",
    color: color.violet,
    display: "flex",
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s15 },
    fontWeight: 500,
    gap: "0.5rem",
  },
  icon: {
    height: { default: "0.875rem", [stylex.env.desktop]: "1rem" },
    width: { default: "0.875rem", [stylex.env.desktop]: "1rem" },
  },
  source: {
    color: color.fg3,
    fontWeight: 400,
  },
  // The parts are spans, because an output element may only hold phrasing content.
  body: {
    display: "block",
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s20 },
  },
});

interface AiNoteProps {
  /** What the note is about, such as "Why". */
  label: string;
  children: ReactNode;
}

export const AiNote = ({ label, children }: AiNoteProps) => (
  <output {...stylex.props(effects.rise, styles.note)}>
    <span {...stylex.props(styles.label)}>
      <Sparkles {...stylex.props(styles.icon)} />
      {label}
      <span {...stylex.props(styles.source)}>· written by AI</span>
    </span>
    <span {...stylex.props(styles.body)}>{children}</span>
  </output>
);
