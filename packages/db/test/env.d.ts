import type { D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      /** A database with the production migrations applied. */
      DB: D1Database;
      /** An empty database, for the SQL that Drizzle generates. */
      DRIZZLE_DB: D1Database;
      DRIZZLE_SQL: string[];
      MIGRATIONS: D1Migration[];
    }
  }
}
