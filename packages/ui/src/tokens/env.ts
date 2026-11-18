// The media queries of the design system, as StyleX compile-time constants: `stylex.env.desktop`.
//
// They are not `defineConsts` tokens like the sizes, for a practical reason. A rule whose media
// query is a token is not valid CSS until the token file has been compiled as well. The
// development server compiles files one at a time, so for a moment the stylesheet would fail to
// build and Vite would cover the page with an error. A constant from `stylex.env` is written
// into the rule when its own file is compiled, so every rule is complete on its own.
//
// The values reach the compiler through the plugin options in ../../vite.ts.

export const env = {
  /** Phone values are the base; this applies from 64rem, where the sidebar appears. */
  desktop: "@media (min-width: 64rem)",
  /** Entrances may move; without it they only fade. */
  motionOk: "@media (prefers-reduced-motion: no-preference)",
  /** A screen without a keyboard, where key hints are useless. */
  touch: "@media (hover: none), (pointer: coarse)",
} as const;

// Tells TypeScript what `stylex.env` holds.
declare module "@stylexjs/stylex/lib/types/StyleXTypes" {
  interface Register {
    env: typeof env;
  }
}
