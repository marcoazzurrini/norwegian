// A short remark from the app: a strong lead and a quieter rest.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  remark: {
    alignSelf: "flex-start",
    backgroundColor: color.raised,
    // An output element is inline by default.
    display: "block",
    borderRadius: { default: radius.r18, [stylex.env.desktop]: radius.r22 },
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    maxWidth: { default: "100%", [stylex.env.desktop]: "45rem" },
    paddingBlock: { default: "0.6875rem", [stylex.env.desktop]: "0.875rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.25rem" },
  },
  center: {
    alignSelf: "center",
  },
  lead: {
    fontWeight: 500,
  },
  rest: {
    color: color.fg2,
  },
});

interface RemarkProps {
  lead: string;
  children?: ReactNode;
  /** Centred in the column, instead of on the left. */
  center?: boolean;
  style?: StyleXStyles;
}

export const Remark = ({
  lead,
  children,
  center = false,
  style,
}: RemarkProps) => (
  <output
    {...stylex.props(
      effects.rise,
      effects.reply,
      styles.remark,
      center && styles.center,
      style
    )}
  >
    <span {...stylex.props(styles.lead)}>{lead} </span>
    <span {...stylex.props(styles.rest)}>{children}</span>
  </output>
);
