import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

import { norskUi } from "./vite.ts";

// The tests run in a real browser, with StyleX compiled the same way as in the app.
export default defineConfig({
  plugins: [norskUi(), react()],
  test: {
    browser: {
      enabled: true,
      headless: true,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
    // The files share one browser window, and some tests resize it.
    fileParallelism: false,
    include: ["test/**/*.test.tsx"],
    setupFiles: ["test/setup.ts"],
  },
});
