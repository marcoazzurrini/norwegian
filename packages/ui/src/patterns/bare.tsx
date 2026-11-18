// The frame shared by the sign-in screen and the short wait before it: the app's name on an empty panel.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { color, radius, text, tracking } from "../tokens/tokens.stylex";

const styles = stylex.create({
  frame: {
    backgroundColor: { default: color.panel, [stylex.env.desktop]: color.base },
    display: "flex",
    flexDirection: "column",
    height: { default: null, [stylex.env.desktop]: "100dvh" },
    minHeight: "100dvh",
    padding: { default: null, [stylex.env.desktop]: "0.625rem" },
  },
  panel: {
    backgroundColor: color.panel,
    borderRadius: { default: null, [stylex.env.desktop]: radius.r24 },
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
  },
  name: {
    fontSize: { default: text.s22, [stylex.env.desktop]: text.s26 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    paddingBottom: { default: null, [stylex.env.desktop]: "1.75rem" },
    paddingInline: { default: "1.25rem", [stylex.env.desktop]: "2.25rem" },
    paddingTop: {
      default: "calc(max(env(safe-area-inset-top), 0.5rem) + 0.375rem)",
      [stylex.env.desktop]: "1.75rem",
    },
  },
});

interface BareProps {
  children?: ReactNode;
}

export const Bare = ({ children }: BareProps) => (
  <div {...stylex.props(styles.frame)}>
    <main {...stylex.props(styles.panel)}>
      <div {...stylex.props(styles.name)}>norsk</div>
      {children}
    </main>
  </div>
);
