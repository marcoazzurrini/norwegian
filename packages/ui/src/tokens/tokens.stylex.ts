// Design tokens from the penna design system (.penna/, page Foundations).
import * as stylex from "@stylexjs/stylex";

/** Colours. Variables, so a theme can replace them later. */
export const color = stylex.defineVars({
  canvas: "#0a0a0a",
  base: "#161616",
  panel: "#212121",
  raised: "#2d2d2d",
  inset: "#1a1a1a",
  control: "#2a2a2a",
  line: "rgba(255, 255, 255, 0.08)",
  strong: "rgba(255, 255, 255, 0.16)",
  fg: "#f2f2f2",
  fg2: "#9b9b9b",
  fg3: "#6b6b6b",
  inverse: "#ffffff",
  onInverse: "#0a0a0a",
  teal: "#4db8a4",
  indigo: "#5b5fef",
  violet: "#8b5cf6",
  blue: "#3b82f6",
  orange: "#f0752e",
  yellow: "#e5c04b",
  green: "#58c878",
  red: "#f2634b",
  link: "#7aa2f7",
  // The same marks on a white surface need darker tones to stay readable.
  greenInk: "#1f9d4d",
  redInk: "#d9402b",
  // Key hints: the cap on a dark surface, and the cap and its text on a white button.
  // Written as mixes because the build tool rounds an rgba() alpha to 1/255 steps.
  keyOnDark: "color-mix(in oklab, #fff 8%, transparent)",
  keyOnLight: "color-mix(in oklab, #000 8%, transparent)",
  keyTextOnLight: "color-mix(in oklab, #000 55%, transparent)",
});

export const font = stylex.defineConsts({
  sans: '"Geist Variable", "Geist", system-ui, sans-serif',
});

/**
 * Type sizes are the design's pixel sizes, written in rem. The text size setting
 * changes the root font size (`--text-scale` in base.css), so every size follows it.
 */
export const text = stylex.defineConsts({
  s11: "0.6875rem",
  s12: "0.75rem",
  s13: "0.8125rem",
  s14: "0.875rem",
  s15: "0.9375rem",
  s16: "1rem",
  s17: "1.0625rem",
  s18: "1.125rem",
  s19: "1.1875rem",
  s20: "1.25rem",
  s22: "1.375rem",
  s24: "1.5rem",
  s26: "1.625rem",
  s28: "1.75rem",
  s30: "1.875rem",
  s32: "2rem",
  s34: "2.125rem",
  s36: "2.25rem",
  s40: "2.5rem",
  s44: "2.75rem",
  s56: "3.5rem",
});

/** Display sizes grow with the window: the phone size at 393px, the desktop size at 2560px. */
export const display = stylex.defineConsts({
  display: "clamp(3.75rem, 5.3125vw, 8.5rem)",
  hero: "clamp(3.25rem, 4.6875vw, 7.5rem)",
  word: "clamp(3.75rem, 5vw, 8rem)",
  title: "clamp(2.25rem, 2.8125vw, 4.5rem)",
  stage: "clamp(2rem, 2.8125vw, 4.5rem)",
});

/** Letter spacing for large type. */
export const tracking = stylex.defineConsts({
  tight: "-0.03em",
  tighter: "-0.035em",
});

export const radius = stylex.defineConsts({
  key: "7px",
  nav: "0.75rem",
  r18: "1.125rem",
  r20: "1.25rem",
  r22: "1.375rem",
  r24: "1.5rem",
  r26: "1.625rem",
  r28: "1.75rem",
  r32: "2rem",
  pill: "9999px",
});

export const motion = stylex.defineConsts({
  easeOut: "cubic-bezier(0.23, 1, 0.32, 1)",
  // A button answers a press at once.
  press: "160ms",
  // New parts of an exchange come in.
  rise: "200ms",
  // A progress bar moves to its new value.
  fill: "300ms",
});
