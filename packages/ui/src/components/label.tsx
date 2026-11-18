// Small grey heading above a group of rows.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  label: {
    color: color.fg3,
    fontSize: text.s14,
    fontWeight: 500,
  },
});

interface LabelProps {
  children: ReactNode;
  style?: StyleXStyles;
}

export const Label = ({ children, style }: LabelProps) => (
  <div {...stylex.props(styles.label, style)}>{children}</div>
);
