// A stand-in for Google, so the tests can go through the real sign-in without leaving the machine.
import { vi } from "vitest";

import type { Auth } from "../src/index";

const SITE = "https://norsk.test";

const encode = (value: Record<string, boolean | number | string>) =>
  btoa(JSON.stringify(value))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");

/** The cookies a browser would send back after receiving `response`. */
export const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .filter((cookie) => !cookie.includes("Max-Age=0"))
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");

/**
 * Walks through sign-in as a browser does: asks the server to start, "visits" Google, and comes
 * back to the callback address. Google's answer says the account belongs to `email`.
 * Returns the server's last answer, and the address Google was asked to send the browser back to.
 */
export const signInWithGoogle = async (auth: Auth, email: string) => {
  const started = await auth.handler(
    new Request(`${SITE}/api/auth/sign-in/social`, {
      body: JSON.stringify({
        callbackURL: "/",
        errorCallbackURL: "/",
        provider: "google",
      }),
      headers: { "content-type": "application/json", origin: SITE },
      method: "POST",
    })
  );

  const { url } = await started.json<{ url: string }>();
  const google = new URL(url).searchParams;
  const now = Math.floor(Date.now() / 1000);

  const claims = {
    aud: "test-client-id",
    email,
    email_verified: true,
    exp: now + 3600,
    iat: now,
    iss: "https://accounts.google.com",
    name: "A Learner",
    sub: `google-${email}`,
  };

  // Google's token endpoint is the only outside address the sign-in calls.
  // oxlint-disable-next-line require-await -- Stands in for `fetch`, which returns a promise.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const address = input instanceof Request ? input.url : String(input);

    if (!address.startsWith("https://oauth2.googleapis.com/token")) {
      throw new Error(`Unexpected request to ${address}`);
    }

    return Response.json({
      access_token: "access-token",
      expires_in: 3600,
      id_token: `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}.signature`,
      scope: "openid email profile",
      token_type: "Bearer",
    });
  });

  try {
    const finished = await auth.handler(
      new Request(
        `${SITE}/api/auth/callback/google?code=a-code&state=${google.get("state")}`,
        { headers: { cookie: cookiesOf(started) } }
      )
    );

    return { finished, returnAddress: google.get("redirect_uri") };
  } finally {
    vi.unstubAllGlobals();
  }
};
