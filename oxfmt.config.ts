import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Written by tools, not by hand.
    ".penna/**",
    "**/curriculum.json",
    "**/routeTree.gen.ts",
    "**/data/**",
  ],
});
