// The tests run inside the Workers runtime, against a real D1 database (Miniflare).
import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import {
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from "drizzle-kit/api";
import { defineConfig } from "vitest/config";

import * as schema from "./src/schema.ts";

const MIGRATIONS = path.join(import.meta.dirname, "../../apps/api/migrations");

export default defineConfig(async () => {
  // What Drizzle would create for the schema, starting from nothing. schema.test.ts compares it with production.
  const fromDrizzle = await generateSQLiteMigration(
    await generateSQLiteDrizzleJson({}),
    await generateSQLiteDrizzleJson(schema)
  );

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          bindings: {
            DRIZZLE_SQL: fromDrizzle,
            MIGRATIONS: await readD1Migrations(MIGRATIONS),
          },
          compatibilityDate: "2026-11-01",
          d1Databases: ["DB", "DRIZZLE_DB"],
        },
      }),
    ],
    test: { include: ["test/**/*.test.ts"] },
  };
});
