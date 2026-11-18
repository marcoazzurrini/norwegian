// A key cap that names the keyboard shortcut for an action. Hidden on touch screens.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, font, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  key: {
    alignItems: "center",
    backgroundColor: color.keyOnDark,
    borderRadius: radius.key,
    color: color.fg2,
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: font.sans,
    fontSize: text.s12,
    fontWeight: 500,
    height: "1.5rem",
    justifyContent: "center",
    minWidth: "1.5rem",
    paddingInline: "7px",
  },
});

interface KeyProps {
  children: ReactNode;
  style?: StyleXStyles;
}

export const Key = ({ children, style }: KeyProps) => (
  <kbd {...stylex.props(styles.key, style, effects.keyboardOnly)}>
    {children}
  </kbd>
);
