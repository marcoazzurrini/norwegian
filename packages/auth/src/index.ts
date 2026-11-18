// Sign-in, on the server.
//
// Hides: Better Auth, Google, the list of email addresses that may use the app, the session
// cookie, and the check that a request was not sent by another website. A route asks for the
// user and gets either the user or the answer to send back; it never sees a session.
import { betterAuth } from "better-auth";

import { isAllowed, settings } from "./settings";
import type { AuthEnv } from "./settings";

export type { AuthEnv } from "./settings";

/** The signed-in learner. */
export interface User {
  id: string;
}

export interface Auth {
  /** Answers everything under /api/auth/: starting sign-in, Google's callback, sign-out, "who am I". */
  handler: (request: Request) => Promise<Response>;
  /**
   * The user who sent the request, or the answer to send instead:
   * 403 if another website made the browser send it, 401 if nobody allowed is signed in.
   */
  requireUser: (request: Request) => Promise<User | Response>;
}

const refuse = (status: 401 | 403, error: string) =>
  Response.json(
    { error },
    { headers: { "cache-control": "no-store" }, status }
  );

export const createAuth = (env: AuthEnv): Auth => {
  const auth = betterAuth(settings(env));

  return {
    handler: async (request) => await auth.handler(request),

    requireUser: async (request) => {
      // The session is a cookie, so refuse requests that another website made the browser send.
      const origin = request.headers.get("origin");

      if (
        origin !== null &&
        origin !== "" &&
        origin !== new URL(request.url).origin
      ) {
        return refuse(403, "Wrong origin");
      }

      const session = await auth.api.getSession({ headers: request.headers });

      // The list is checked on every request, so removing an address locks its devices out at once.
      if (session === null || !isAllowed(env, session.user.email)) {
        return refuse(401, "Not signed in");
      }

      return { id: session.user.id };
    },
  };
};
