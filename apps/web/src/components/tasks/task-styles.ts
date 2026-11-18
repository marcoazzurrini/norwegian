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
  // "Hint" and "I don't know", under the question.
  help: {
    alignSelf: "flex-start",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  // The answer to copy once, after a second miss or "I don't know".
  copy: {
    alignSelf: "flex-start",
    minWidth: { default: "13.75rem", [stylex.env.desktop]: "22.5rem" },
  },
  copyLabel: {
    color: color.fg3,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
  },
  copyWord: {
    fontSize: { default: text.s32, [stylex.env.desktop]: text.s56 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    paddingTop: "0.25rem",
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
