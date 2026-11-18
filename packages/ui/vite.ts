// What a Vite app or test runner needs in order to use @norsk/ui. Kept here so that the web app
// and this package's own tests are set up the same way.
import { fileURLToPath } from "node:url";

import stylex from "@stylexjs/unplugin/vite";
import type { PluginOption } from "vite";

import { env } from "./src/tokens/env.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

type StylexOptions = NonNullable<Parameters<typeof stylex>[0]>;

// The plugin's own types say it returns `any`. It returns a Vite plugin.
const compile: (options: StylexOptions) => PluginOption = stylex;

interface NorskUiOptions {
  /**
   * In a build the compiled rules are appended to one of the app's stylesheets.
   * This picks it by file name; without it the plugin takes the first it finds.
   */
  stylesheet?: (fileName: string) => boolean;
}

/**
 * The Vite plugin that an app needs to use @norsk/ui. Put it before the React plugin:
 * StyleX must see the code while it still has its `stylex.create` calls.
 *
 * In development the rules are served at `/virtual:stylex.css`; the app loads them by importing
 * `virtual:stylex:runtime` once, which also refreshes them after an edit.
 */
export const norskUi = ({ stylesheet }: NorskUiOptions = {}): PluginOption => {
  const options: StylexOptions = {
    // The media queries, available in styles as `stylex.env`.
    env,
    // Token names are hashed from the path of their file. The path is taken from the
    // repository root, so a token gets the same name whichever package imports it.
    unstable_moduleResolution: { rootDir: repoRoot, type: "commonJS" },
  };

  if (stylesheet !== undefined) {
    options.cssInjectionTarget = stylesheet;
  }

  return compile(options);
};
