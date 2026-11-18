// Two actions at the bottom: the quieter one on the left, the main one on the right. On a phone they share the width.
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

const styles = stylex.create({
  // A grid with equal columns makes the children share the width without styling them;
  // on a wide screen they keep their own width and sit at the two ends.
  row: {
    alignItems: "center",
    display: { default: "grid", [stylex.env.desktop]: "flex" },
    gap: { default: "0.75rem", [stylex.env.desktop]: "1rem" },
    gridAutoColumns: "1fr",
    gridAutoFlow: "column",
    justifyContent: { default: null, [stylex.env.desktop]: "space-between" },
  },
});

interface DockRowProps {
  children: ReactNode;
}

export const DockRow = ({ children }: DockRowProps) => (
  <div {...stylex.props(styles.row)}>{children}</div>
);
