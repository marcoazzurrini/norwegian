// Shared behaviours that any element can take: the press response, the entrance, and two visibility rules.
import * as stylex from "@stylexjs/stylex";

import { motion } from "./tokens.stylex";

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
});

const riseIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
});

const popIn = stylex.keyframes({
  from: { opacity: 0, transform: "scale(0.9)" },
});

/** The time between two parts that come in one after the other. */
const STAGGER_MS = 50;

export const effects = stylex.create({
  // Buttons answer a press at once.
  press: {
    transform: {
      default: null,
      ":active:not(:disabled)": "scale(0.97)",
    },
    transitionDuration: motion.press,
    // The text colour is in the list so that it changes in step with the background.
    transitionProperty: "transform, background-color, color, opacity",
    transitionTimingFunction: motion.easeOut,
  },
  // New parts of an exchange fade in and rise slightly; with reduced motion they only fade.
  rise: {
    animationDuration: motion.rise,
    animationFillMode: "both",
    animationName: {
      default: fadeIn,
      [stylex.env.motionOk]: riseIn,
    },
    animationTimingFunction: motion.easeOut,
  },
  // A small mark, such as a check, grows into place; with reduced motion it only fades.
  pop: {
    animationDuration: motion.press,
    animationFillMode: "both",
    animationName: {
      default: fadeIn,
      [stylex.env.motionOk]: popIn,
    },
    animationTimingFunction: motion.easeOut,
  },
  // With `rise`: the place of a part in a group whose parts come in one after the other.
  after: (place: number) => ({
    animationDelay: `${place * STAGGER_MS}ms`,
  }),
  noScrollbar: {
    "::-webkit-scrollbar": { display: "none" },
    scrollbarWidth: "none",
  },
  // Key hints are useless on a touch screen. This is a media block, not a value of `display`,
  // so that it only adds the hidden case and leaves the element's own display alone.
  keyboardOnly: {
    [stylex.env.touch]: { display: "none" },
  },
});
