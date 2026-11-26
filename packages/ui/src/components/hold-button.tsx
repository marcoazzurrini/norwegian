// A button for an action that cannot be undone. A tap does nothing: it has to be held.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { color, motion } from "../tokens/tokens.stylex";
import { buttonStyle } from "./button";

/** How long the button has to be held. The fill takes `motion.hold`, which is the same time. */
const HOLD_MS = 2000;

const styles = stylex.create({
  button: {
    color: color.red,
    overflow: "hidden",
    position: "relative",
    userSelect: "none",
    // A long press on a phone would otherwise open the menu of the system.
    WebkitTouchCallout: "none",
  },
  // A red copy of the label that lies over the button. It is uncovered from the left while
  // the button is held, and covered again quickly when the hold ends early.
  fill: {
    alignItems: "center",
    backgroundColor: color.red,
    clipPath: "inset(0 100% 0 0)",
    color: color.onInverse,
    display: "flex",
    gap: "0.5rem",
    inset: 0,
    justifyContent: "center",
    position: "absolute",
    transitionDuration: motion.rise,
    transitionProperty: "clip-path",
    transitionTimingFunction: motion.easeOut,
  },
  filling: {
    clipPath: "inset(0 0 0 0)",
    transitionDuration: motion.hold,
    transitionTimingFunction: "linear",
  },
});

interface HoldButtonProps {
  /** Called once the button has been held for the whole time. */
  onHeld: () => void;
  children: ReactNode;
  style?: StyleXStyles;
}

export const HoldButton = ({ onHeld, children, style }: HoldButtonProps) => {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  const start = () => {
    clearTimeout(timer.current);
    setHolding(true);

    timer.current = setTimeout(() => {
      setHolding(false);
      onHeld();
    }, HOLD_MS);
  };

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    []
  );

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        // A key that is held down repeats; only the first press starts the hold.
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          start();
        }
      }}
      onKeyUp={stop}
      onBlur={stop}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      {...stylex.props(buttonStyle("secondary", "small"), styles.button, style)}
    >
      {children}
      <span
        aria-hidden="true"
        {...stylex.props(styles.fill, holding && styles.filling)}
      >
        {children}
      </span>
    </button>
  );
};
