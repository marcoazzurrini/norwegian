import { defineConfig, devices } from "@playwright/test";

const PORT = 4317;
const inCi = process.env.CI !== undefined;

// End-to-end tests run against the development server, which skips the sign-in screen and has no sync server.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  reporter: inCi ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `bunx vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !inCi,
    timeout: 120_000,
  },
});
