// A small two-part label: a strong word and a quieter one.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  chip: {
    alignItems: "center",
    backgroundColor: color.base,
    borderColor: color.line,
    borderRadius: radius.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    fontSize: text.s13,
    gap: "0.375rem",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
  },
  strong: { fontWeight: 500 },
  quiet: { color: color.fg2 },
});

interface ChipProps {
  strong: string;
  children?: ReactNode;
  style?: StyleXStyles;
}

export const Chip = ({ strong, children, style }: ChipProps) => (
  <span {...stylex.props(styles.chip, style)}>
    <span {...stylex.props(styles.strong)}>{strong}</span>
    {children === undefined || children === null || children === "" ? null : (
      <span {...stylex.props(styles.quiet)}>{children}</span>
    )}
  </span>
);
