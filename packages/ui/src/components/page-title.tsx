// Page title with an optional line under it and an optional control on the right.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, display, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  row: {
    alignItems: { default: null, [stylex.env.desktop]: "flex-end" },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: { default: "1.25rem", [stylex.env.desktop]: "1rem" },
    justifyContent: { default: null, [stylex.env.desktop]: "space-between" },
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
}

export const PageTitle = ({ title, sub, children }: PageTitleProps) => (
  <div {...stylex.props(styles.row)}>
    <div>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      {sub === undefined || sub === "" ? null : (
        <p {...stylex.props(styles.sub)}>{sub}</p>
      )}
    </div>
    {children}
  </div>
);
