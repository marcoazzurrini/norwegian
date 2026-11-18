// The tests run the real Worker inside the Workers runtime, with a real D1 database and R2 bucket (Miniflare).
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        // Stand-ins for the secrets. They replace anything a local .dev.vars file would supply.
        bindings: {
          ALLOWED_EMAILS: "learner@example.com",
          BETTER_AUTH_SECRET: "a-secret-for-tests-only-0123456789abcdef",
          BETTER_AUTH_URL: "https://norsk.test",
          GOOGLE_CLIENT_ID: "test-client-id",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
          MIGRATIONS: await readD1Migrations("./migrations"),
          OPENROUTER_API_KEY: "test-openrouter-key",
          SYNC_KEY: "test-sync-key",
        },
      },
      wrangler: { configPath: "./wrangler.jsonc" },
    }),
  ],
  test: { include: ["test/**/*.test.ts"], setupFiles: ["./test/setup.ts"] },
}));
