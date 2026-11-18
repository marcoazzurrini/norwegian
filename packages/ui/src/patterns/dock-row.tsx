// Two actions at the bottom: the quieter one on the left, the main one on the right. On a phone they share the width.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1rem" },
    justifyContent: "space-between",
  },
});

interface DockRowProps {
  /** The two actions. An empty element can stand in for the one that is missing. */
  children: ReactNode;
}

// On a phone each child grows from nothing to share the free width, which is a rule on the
// children and so cannot be StyleX. It lives in base.css and is switched on by the data attribute.
export const DockRow = ({ children }: DockRowProps) => (
  <div data-norsk-dock-row="" {...stylex.props(styles.row)}>
    {children}
  </div>
);
