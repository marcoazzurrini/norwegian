import type { D1Migration } from "cloudflare:test";

import type { AuthEnv } from "../src/index";

declare global {
  namespace Cloudflare {
    interface Env extends AuthEnv {
      MIGRATIONS: D1Migration[];
    }
  }
}
