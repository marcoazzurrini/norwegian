import type { BetterAuthOptions } from "better-auth";
// How Better Auth is set up. The server (index.ts) and the test helper (testing.ts) share it,
// so a session made in a test is one the real server accepts.
import { APIError } from "better-auth/api";

export interface AuthEnv {
  /** Email addresses that may sign in, separated by commas. */
  ALLOWED_EMAILS: string;
  /** Secrets, set with `wrangler secret put`. */
  BETTER_AUTH_SECRET: string;
  /** The site's address, for example https://norwegian.marcoazzurrini.com. */
  BETTER_AUTH_URL: string;
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
}

const DAY = 60 * 60 * 24;

export const isAllowed = (env: AuthEnv, email: string): boolean =>
  env.ALLOWED_EMAILS.split(",")
    .map((allowed) => allowed.trim().toLowerCase())
    .filter((allowed) => allowed !== "")
    .includes(email.toLowerCase());

export const settings = (env: AuthEnv) =>
  ({
    appName: "Norsk",
    baseURL: env.BETTER_AUTH_URL,
    // Better Auth's own D1 support. It wrote the rows that are in production, so it reads them back the same way.
    database: env.DB,
    databaseHooks: {
      user: {
        create: {
          // oxlint-disable-next-line require-await -- Better Auth's type for this hook requires a promise, and the check has nothing to wait for.
          before: async (user) => {
            if (!isAllowed(env, user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "This Google account may not use this app.",
              });
            }

            return { data: user };
          },
        },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    // A device stays signed in as long as it is used at least once every six months.
    session: { expiresIn: DAY * 180, updateAge: DAY },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
  }) satisfies BetterAuthOptions;
