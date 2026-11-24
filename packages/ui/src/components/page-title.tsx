// Page title with an optional line under it, an optional control beside it,
// and an optional second part that a page can line up with a column of its own.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, display, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  row: {
    alignItems: { default: null, [stylex.env.desktop]: "flex-end" },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: "1.25rem",
  },
  // The words and the control. When they do not fit side by side, the control goes under the words.
  main: {
    alignItems: { default: null, [stylex.env.desktop]: "flex-end" },
    display: "flex",
    flexBasis: { default: null, [stylex.env.desktop]: "0%" },
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    flexGrow: { default: null, [stylex.env.desktop]: 1 },
    flexShrink: { default: null, [stylex.env.desktop]: 1 },
    flexWrap: { default: null, [stylex.env.desktop]: "wrap" },
    gap: { default: "1.25rem", [stylex.env.desktop]: "1rem" },
    justifyContent: { default: null, [stylex.env.desktop]: "space-between" },
    minWidth: 0,
  },
  title: {
    fontSize: display.title,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  sub: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s22 },
    margin: 0,
    paddingTop: { default: "0.375rem", [stylex.env.desktop]: "0.625rem" },
  },
});

interface PageTitleProps {
  title: string;
  sub?: string;
  /** A control shown beside the title on a wide screen and under it on a phone. */
  children?: ReactNode;
  /**
   * A second part after the title and its control. A page whose content has two columns
   * gives the same columns in `style`, so that this part sits above the second one.
   */
  aside?: ReactNode;
  /** Applies to the row that holds both parts. */
  style?: StyleXStyles;
}

export const PageTitle = ({
  title,
  sub,
  children,
  aside,
  style,
}: PageTitleProps) => (
  <div {...stylex.props(styles.row, style)}>
    <div {...stylex.props(styles.main)}>
      <div>
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        {sub === undefined || sub === "" ? null : (
          <p {...stylex.props(styles.sub)}>{sub}</p>
        )}
      </div>
      {children}
    </div>
    {aside}
  </div>
);
