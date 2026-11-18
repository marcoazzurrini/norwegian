// Shared behaviours that any element can take: the press response, the entrance, and two visibility rules.
import * as stylex from "@stylexjs/stylex";

import { motion } from "./tokens.stylex";

const fadeIn = stylex.keyframes({
  from: { opacity: 0 },
});

const riseIn = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(8px) scale(0.98)" },
});

export const effects = stylex.create({
  // Buttons answer a press at once.
  press: {
    transform: {
      default: null,
      ":active:not(:disabled)": "scale(0.97)",
    },
    transitionDuration: motion.press,
    transitionProperty: "transform, background-color, opacity",
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
