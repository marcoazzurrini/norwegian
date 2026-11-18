// Small grey heading above a group of rows. It names the group; it is not the label of a form control.
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

interface GroupLabelProps {
  children: ReactNode;
  style?: StyleXStyles;
}

export const GroupLabel = ({ children, style }: GroupLabelProps) => (
  <div {...stylex.props(styles.label, style)}>{children}</div>
);
