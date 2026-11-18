// The small centred line that says where you are in a task.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  stamp: {
    alignSelf: "center",
    color: color.fg3,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s15 },
    fontWeight: 500,
    paddingBottom: { default: "0.375rem", [stylex.env.desktop]: "0.625rem" },
  },
});

interface StampProps {
  children: ReactNode;
}

export const Stamp = ({ children }: StampProps) => (
  <div {...stylex.props(styles.stamp)}>{children}</div>
);
