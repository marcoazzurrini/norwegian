// The standard container: a dark inset surface with a hairline.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, radius } from "../tokens/tokens.stylex";

const styles = stylex.create({
  card: {
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r26 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    padding: { default: "1.125rem", [stylex.env.desktop]: "1.75rem" },
  },
});

interface CardProps {
  children: ReactNode;
  style?: StyleXStyles;
}

export const Card = ({ children, style }: CardProps) => (
  <div {...stylex.props(styles.card, style)}>{children}</div>
);
