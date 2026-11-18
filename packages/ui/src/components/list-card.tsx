// A card that holds a list of rows separated by hairlines.
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
    paddingBlock: { default: "0.125rem", [stylex.env.desktop]: "0.25rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
  },
});

interface ListCardProps {
  children: ReactNode;
  style?: StyleXStyles;
}

// The hairline between rows is a rule on the children, which StyleX cannot express.
// It lives in base.css and is switched on by the data attribute.
export const ListCard = ({ children, style }: ListCardProps) => (
  <div data-norsk-list="" {...stylex.props(styles.card, style)}>
    {children}
  </div>
);
