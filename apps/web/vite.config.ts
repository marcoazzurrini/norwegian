import { norskUi } from "@norsk/ui/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app keeps all learner data in the browser, so it is built as a single-page app
// (no server rendering) and can be hosted as static files.
const config = defineConfig({
  // The deploy asks for source maps, sends them to Sentry and deletes them, so that an error
  // names the real file and line. They are not published with the app.
  build: { sourcemap: process.env.SOURCE_MAPS === "1" ? "hidden" : false },
  plugins: [
    // StyleX compiles the styles of the screens and of @norsk/ui, which the app imports as
    // TypeScript source. In a build its rules are appended to the base stylesheet, which the
    // root route links, so the prerendered page has every style from the start.
    norskUi({
      stylesheet: (fileName) => /(?:^|\/)base-[\w-]+\.css$/u.test(fileName),
    }),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
  resolve: { tsconfigPaths: true },
});

export default config;
