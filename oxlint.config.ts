import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";

// Code that the refactor has not reached yet (docs/refactor-plan.md).
// Each step removes its folder from this list; the list is empty when the plan is done.
const notYetRefactored = [
  "apps/web/src/**",
  "apps/web/public/sw.js",
  "apps/api/src/**",
  "packages/protocol/src/**",
];

export default defineConfig({
  env: core.env,
  extends: [core, react, tanstack, playwright, antiSlop],
  ignorePatterns: [
    ...core.ignorePatterns,
    // Written by tools, not by hand.
    ".penna/**",
    "**/routeTree.gen.ts",
    "**/data/**",
    ...notYetRefactored,
  ],
  options: { typeAware: true },
});
