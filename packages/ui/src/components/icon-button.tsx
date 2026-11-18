// A round button that holds only an icon. The label is its accessible name.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { effects } from "../tokens/effects";
import { color, radius } from "../tokens/tokens.stylex";

const styles = stylex.create({
  button: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    borderWidth: 0,
    color: color.fg,
    display: "flex",
    flexShrink: 0,
    height: { default: "2.5rem", [stylex.env.desktop]: "2.75rem" },
    justifyContent: "center",
    width: { default: "2.5rem", [stylex.env.desktop]: "2.75rem" },
  },
});

interface IconButtonProps extends Omit<
  ComponentProps<"button">,
  "aria-label" | "className" | "style"
> {
  label: string;
  style?: StyleXStyles;
}

export const IconButton = ({
  label,
  children,
  style,
  ...rest
}: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    {...rest}
    {...stylex.props(effects.press, styles.button, style)}
  >
    {children}
  </button>
);
