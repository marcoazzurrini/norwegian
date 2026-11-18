// The tests run inside the Workers runtime, against a real D1 database (Miniflare).
import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

const MIGRATIONS = path.join(import.meta.dirname, "../../apps/api/migrations");

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      miniflare: {
        bindings: {
          ALLOWED_EMAILS: "learner@example.com, Second@Example.com",
          BETTER_AUTH_SECRET: "a-secret-for-tests-only-0123456789abcdef",
          BETTER_AUTH_URL: "https://norsk.test",
          GOOGLE_CLIENT_ID: "test-client-id",
          GOOGLE_CLIENT_SECRET: "test-client-secret",
          MIGRATIONS: await readD1Migrations(MIGRATIONS),
        },
        compatibilityDate: "2026-11-01",
        // Better Auth uses Node's AsyncLocalStorage.
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB"],
      },
    }),
  ],
  test: { include: ["test/**/*.test.ts"] },
}));
