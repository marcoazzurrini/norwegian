// Looks that more than one task shares.
import { color, text, tracking } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";

export const taskStyles = stylex.create({
  // The title of a task screen.
  heading: {
    fontSize: "clamp(2.125rem, 2.8125vw, 4.5rem)",
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  // The audio button beside an answer.
  answerAudio: {
    height: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
    width: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
  },
  // "Show answer", which comes in under a hint.
  showAnswer: {
    alignSelf: "flex-start",
  },
  shrinks: {
    minWidth: 0,
  },
  grow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  right: { color: color.green },
  wrong: { color: color.red },
  icon18: {
    flexShrink: 0,
    height: "1.125rem",
    width: "1.125rem",
  },
  quiet14: {
    color: color.fg2,
    fontSize: text.s14,
  },
});
