// What the learner typed: a white bubble on the right.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  bubble: {
    alignSelf: "flex-end",
    backgroundColor: color.inverse,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r28 },
    color: color.onInverse,
    fontSize: { default: text.s26, [stylex.env.desktop]: text.s44 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    maxWidth: "100%",
    overflowWrap: "break-word",
    paddingBlock: { default: "0.75rem", [stylex.env.desktop]: "1.125rem" },
    paddingInline: { default: "1.125rem", [stylex.env.desktop]: "1.75rem" },
  },
});

interface MineProps {
  children: ReactNode;
}

export const Mine = ({ children }: MineProps) => (
  <div {...stylex.props(effects.rise, styles.bubble)}>{children}</div>
);
