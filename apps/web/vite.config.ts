import { norskUi } from "@norsk/ui/vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The app keeps all learner data in the browser, so it is built as a single-page app
// (no server rendering) and can be hosted as static files.
const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    // StyleX compiles the styles of @norsk/ui, which the app imports as TypeScript source.
    // In a build its rules are appended to the app's own stylesheet, after Tailwind's.
    norskUi({
      stylesheet: (fileName) => /(?:^|\/)styles-[\w-]+\.css$/u.test(fileName),
    }),
    tailwindcss(),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
  ],
});

export default config;
