// The standard push button, in four looks and three sizes, with an optional key hint.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps } from "react";

import { effects } from "../tokens/effects";
import { color, font, radius, text } from "../tokens/tokens.stylex";

export type ButtonVariant = "primary" | "secondary" | "outline" | "danger";

export type ButtonSize = "large" | "medium" | "small";

const styles = stylex.create({
  base: {
    alignItems: "center",
    borderRadius: radius.pill,
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 500,
    gap: "0.5rem",
    justifyContent: "center",
    opacity: { default: null, ":disabled": 0.4 },
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  // The button that takes the Enter key shows its key hint, so it needs no focus ring as well.
  noRing: {
    outline: { default: null, ":focus-visible": "none" },
  },
  hint: {
    backgroundColor: color.keyOnLight,
    borderRadius: radius.key,
    color: color.keyTextOnLight,
    fontFamily: font.sans,
    fontSize: text.s12,
    fontWeight: 500,
    marginRight: "-0.5rem",
    paddingBlock: "0.125rem",
    paddingInline: "7px",
  },
});

const variants = stylex.create({
  primary: {
    backgroundColor: color.inverse,
    borderWidth: 0,
    color: color.onInverse,
  },
  secondary: {
    backgroundColor: color.control,
    borderWidth: 0,
    color: color.fg,
  },
  outline: {
    backgroundColor: "transparent",
    borderColor: color.strong,
    borderStyle: "solid",
    borderWidth: 1,
    color: color.fg,
  },
  danger: {
    backgroundColor: color.red,
    borderWidth: 0,
    color: color.onInverse,
  },
});

const sizes = stylex.create({
  // The main action of a screen.
  large: {
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s18 },
    height: { default: "3.25rem", [stylex.env.desktop]: "3.5rem" },
    paddingInline: { default: "1.375rem", [stylex.env.desktop]: "1.75rem" },
  },
  medium: {
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    height: { default: "2.25rem", [stylex.env.desktop]: "2.75rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.25rem" },
  },
  small: {
    fontSize: text.s14,
    height: "2.25rem",
    paddingInline: "1rem",
  },
});

/**
 * The look of a button, for an element that is not a `<button>`, such as a router link:
 * `<Link {...stylex.props(buttonStyle("primary", "large"))} />`.
 */
export const buttonStyle = (
  variant: ButtonVariant = "primary",
  size: ButtonSize = "large"
): StyleXStyles => [effects.press, styles.base, variants[variant], sizes[size]];

interface ButtonProps extends Omit<
  ComponentProps<"button">,
  "className" | "style"
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** The key that does the same thing, shown where there is a keyboard. */
  hint?: string;
  style?: StyleXStyles;
}

export const Button = ({
  variant = "primary",
  size = "large",
  hint,
  children,
  style,
  ...rest
}: ButtonProps) => (
  <button
    type="button"
    {...rest}
    {...stylex.props(
      buttonStyle(variant, size),
      rest.autoFocus === true && styles.noRing,
      style
    )}
  >
    {children}
    {hint === undefined ? null : (
      <kbd {...stylex.props(styles.hint, effects.keyboardOnly)}>{hint}</kbd>
    )}
  </button>
);
