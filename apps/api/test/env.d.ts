import type { AuthEnv } from "@norsk/auth";
import type { D1Migration } from "cloudflare:test";

import type worker from "../src/index";

declare global {
  namespace Cloudflare {
    /** Tells `exports.default` in the tests that it is the Worker in src/index.ts. */
    interface GlobalProps {
      mainModule: { default: typeof worker };
    }

    interface Env extends AuthEnv {
      AUDIO: R2Bucket;
      EXPLAIN_LIMIT: RateLimit;
      MIGRATIONS: D1Migration[];
      OPENROUTER_API_KEY: string;
      SYNC_KEY: string;
    }
  }
}
