import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

export default defineConfig({
  env: core.env,
  extends: [core, react, tanstack, playwright, antiSlop],
  ignorePatterns: [
    ...core.ignorePatterns,
    // Written by tools, not by hand.
    ".penna/**",
    "**/routeTree.gen.ts",
    "**/data/**",
  ],
  options: { typeAware: true },
});
