import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import { createAuth } from "../src/index";
import type { User } from "../src/index";
import { createTestSession } from "../src/testing";
import { cookiesOf, signInWithGoogle } from "./google";

const SITE = "https://norsk.test";
const DAY = 86_400_000;
const LEARNER = "learner@example.com";

const count = async (table: string) => {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM "${table}"`
  ).first<{ n: number }>();

  return row?.n ?? 0;
};

/** A request as the app sends it: same origin, with the session cookie if there is one. */
const apiRequest = (cookie: string, headers: Record<string, string> = {}) =>
  new Request(`${SITE}/api/sync`, {
    headers: { cookie, origin: SITE, ...headers },
    method: "POST",
  });

/** The id of the only account there is. */
const onlyUser = async () => {
  const row = await env.DB.prepare(`SELECT id FROM "user"`).first<{
    id: string;
  }>();

  return { id: row?.id };
};

const refusal = async (answer: User | Response) => {
  if (!(answer instanceof Response)) {
    throw new TypeError("Expected a refusal, got a user");
  }

  return {
    body: await answer.json(),
    cache: answer.headers.get("cache-control"),
    status: answer.status,
  };
};

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});

describe("signing in with Google", () => {
  test("an allowed address gets an account and a session that lasts 180 days", async () => {
    const auth = createAuth(env);
    const { finished, returnAddress } = await signInWithGoogle(auth, LEARNER);

    expect(returnAddress).toBe(`${SITE}/api/auth/callback/google`);
    expect(finished.status).toBe(302);
    expect(finished.headers.get("location")).toBe("/");

    const cookie = finished.headers
      .getSetCookie()
      .find((c) => c.includes("session_token"));

    expect(cookie).toMatch(/^__Secure-better-auth\.session_token=/u);
    expect(cookie).toContain(`Max-Age=${180 * 24 * 3600}`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(await count("user")).toBe(1);

    const user = await auth.requireUser(apiRequest(cookiesOf(finished)));

    expect(user).toEqual(await onlyUser());
  });

  test("the list of allowed addresses ignores capital letters and spaces", async () => {
    const auth = createAuth(env);
    // The list has " Second@Example.com".
    const { finished } = await signInWithGoogle(auth, "second@example.com");

    expect(await count("user")).toBe(1);
    expect(
      await auth.requireUser(apiRequest(cookiesOf(finished)))
    ).not.toBeInstanceOf(Response);
  });

  test("an address outside the list gets no account and no session", async () => {
    const auth = createAuth(env);

    const { finished } = await signInWithGoogle(auth, "stranger@example.com");

    // Better Auth answers the callback itself; the browser is not sent back to the app.
    expect(finished.status).toBe(403);
    expect(await finished.json()).toMatchObject({
      message: "This Google account may not use this app.",
    });
    expect(finished.headers.get("set-cookie") ?? "").not.toContain(
      "session_token"
    );
    expect(await count("user")).toBe(0);
    expect(await count("session")).toBe(0);
    expect(await count("account")).toBe(0);
  });

  test("the app can ask who is signed in, and sign out", async () => {
    const auth = createAuth(env);
    const { finished } = await signInWithGoogle(auth, LEARNER);
    const cookie = cookiesOf(finished);

    const who = await auth.handler(
      new Request(`${SITE}/api/auth/get-session`, { headers: { cookie } })
    );

    expect(await who.json()).toMatchObject({ user: { email: LEARNER } });

    await auth.handler(
      new Request(`${SITE}/api/auth/sign-out`, {
        body: "{}",
        headers: { "content-type": "application/json", cookie, origin: SITE },
        method: "POST",
      })
    );

    expect(await count("session")).toBe(0);
    expect(
      await refusal(await auth.requireUser(apiRequest(cookie)))
    ).toMatchObject({ status: 401 });
  });
});

describe("asking for the user", () => {
  test("without a session the answer is 401", async () => {
    const answer = await createAuth(env).requireUser(apiRequest(""));

    expect(await refusal(answer)).toEqual({
      body: { error: "Not signed in" },
      cache: "no-store",
      status: 401,
    });
  });

  test("a cookie that was tampered with is refused", async () => {
    const cookie = await createTestSession(env, LEARNER);
    const answer = await createAuth(env).requireUser(apiRequest(`${cookie}x`));

    expect(await refusal(answer)).toMatchObject({ status: 401 });
  });

  test("an address taken off the list is locked out, even with a session", async () => {
    const cookie = await createTestSession(env, LEARNER);

    const stricter = createAuth({
      ...env,
      ALLOWED_EMAILS: "other@example.com",
    });

    expect(await createAuth(env).requireUser(apiRequest(cookie))).toEqual(
      await onlyUser()
    );
    expect(
      await refusal(await stricter.requireUser(apiRequest(cookie)))
    ).toEqual({
      body: { error: "Not signed in" },
      cache: "no-store",
      status: 401,
    });
  });

  test("an empty list allows nobody", async () => {
    const cookie = await createTestSession(env, LEARNER);
    const nobody = createAuth({ ...env, ALLOWED_EMAILS: "" });

    expect(
      await refusal(await nobody.requireUser(apiRequest(cookie)))
    ).toMatchObject({ status: 401 });
  });

  test("a request sent by another website is refused, even with a session", async () => {
    const cookie = await createTestSession(env, LEARNER);

    const answer = await createAuth(env).requireUser(
      apiRequest(cookie, { origin: "https://evil.example" })
    );

    expect(await refusal(answer)).toEqual({
      body: { error: "Wrong origin" },
      cache: "no-store",
      status: 403,
    });
  });

  test("a request without an origin (not from a browser page) is accepted", async () => {
    const cookie = await createTestSession(env, LEARNER);

    const answer = await createAuth(env).requireUser(
      new Request(`${SITE}/api/sync`, { headers: { cookie }, method: "POST" })
    );

    expect(answer).not.toBeInstanceOf(Response);
  });

  test("the test helper cannot sign in an address outside the list either", async () => {
    await expect(
      createTestSession(env, "stranger@example.com")
    ).rejects.toThrow();
    expect(await count("user")).toBe(0);
  });
});

const at = (offset: number) => new Date(Date.now() + offset).toISOString();

/** The cookie of a session, signed the way Better Auth signs it. */
const cookieFor = async (token: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.BETTER_AUTH_SECRET),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token)
  );

  const signed = `${token}.${btoa(String.fromCodePoint(...new Uint8Array(signature)))}`;

  return `__Secure-better-auth.session_token=${encodeURIComponent(signed)}`;
};

const existing = async (session: { expiresAt: string; updatedAt: string }) => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt)
       VALUES ('user-1', 'A Learner', ?1, 1, NULL, ?2, ?2)`
    ).bind(LEARNER, at(-30 * DAY)),
    env.DB.prepare(
      `INSERT INTO "account" (id, accountId, providerId, userId, accessToken, idToken, accessTokenExpiresAt, scope, createdAt, updatedAt)
       VALUES ('account-1', 'google-1', 'google', 'user-1', 'access', 'id', ?1, 'openid,email,profile', ?1, ?1)`
    ).bind(at(-30 * DAY)),
    env.DB.prepare(
      `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, ipAddress, userAgent, userId)
       VALUES ('session-1', ?1, 'existing-token', ?2, ?3, '', '', 'user-1')`
    ).bind(session.expiresAt, at(-30 * DAY), session.updatedAt),
  ]);

  return await cookieFor("existing-token");
};

const storedSession = async () =>
  await env.DB.prepare(
    `SELECT expiresAt, updatedAt, typeof(expiresAt) AS kind FROM "session"`
  ).first<{ expiresAt: string; kind: string; updatedAt: string }>();

// The rows below are written by hand, in the form the production database holds them
// (Better Auth with its own D1 support): dates as ISO text, true as 1.
describe("accounts and sessions that already exist", () => {
  test("a session from before this change is still accepted", async () => {
    const cookie = await existing({
      expiresAt: at(150 * DAY),
      updatedAt: at(-DAY / 2),
    });

    expect(await createAuth(env).requireUser(apiRequest(cookie))).toEqual({
      id: "user-1",
    });
  });

  test("a session used within the last day is left as it is", async () => {
    const before = { expiresAt: at(179.5 * DAY), updatedAt: at(-DAY / 2) };
    const cookie = await existing(before);

    await createAuth(env).requireUser(apiRequest(cookie));

    expect(await storedSession()).toMatchObject(before);
  });

  test("a session not used for more than a day is extended to 180 days, in the same date format", async () => {
    const cookie = await existing({
      expiresAt: at(170 * DAY),
      updatedAt: at(-10 * DAY),
    });

    await createAuth(env).requireUser(apiRequest(cookie));

    const stored = await storedSession();

    expect(stored?.kind).toBe("text");
    expect(stored?.expiresAt).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u
    );
    expect(Date.parse(stored?.expiresAt ?? "") - Date.now()).toBeGreaterThan(
      179.9 * DAY
    );
    expect(Date.now() - Date.parse(stored?.updatedAt ?? "")).toBeLessThan(DAY);
  });

  test("a session past its end is refused", async () => {
    const cookie = await existing({
      expiresAt: at(-1000),
      updatedAt: at(-10 * DAY),
    });

    const answer = await createAuth(env).requireUser(apiRequest(cookie));

    expect(await refusal(answer)).toMatchObject({ status: 401 });
  });

  test("signing in again with Google reuses the account", async () => {
    await existing({ expiresAt: at(150 * DAY), updatedAt: at(-DAY / 2) });
    await env.DB.exec(
      `UPDATE "account" SET accountId = 'google-${LEARNER}' WHERE id = 'account-1'`
    );

    const auth = createAuth(env);
    const { finished } = await signInWithGoogle(auth, LEARNER);

    expect(await count("user")).toBe(1);
    expect(await count("account")).toBe(1);
    expect(await count("session")).toBe(2);
    expect(await auth.requireUser(apiRequest(cookiesOf(finished)))).toEqual({
      id: "user-1",
    });
  });

  test("a new sign-in writes rows in the same form as the existing ones", async () => {
    await signInWithGoogle(createAuth(env), LEARNER);

    const kinds = await env.DB.prepare(
      `SELECT typeof(u.createdAt) AS userCreated, typeof(u.emailVerified) AS verified, u.emailVerified AS verifiedValue,
              typeof(s.expiresAt) AS sessionExpires, s.expiresAt AS expiresAt, typeof(a.accessTokenExpiresAt) AS tokenExpires
       FROM "user" u JOIN "session" s ON s.userId = u.id JOIN "account" a ON a.userId = u.id`
    ).first<{
      expiresAt: string;
      sessionExpires: string;
      tokenExpires: string;
      userCreated: string;
      verified: string;
      verifiedValue: number;
    }>();

    expect(kinds).toMatchObject({
      sessionExpires: "text",
      tokenExpires: "text",
      userCreated: "text",
      verified: "integer",
      verifiedValue: 1,
    });
    expect(kinds?.expiresAt).toMatch(
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u
    );
  });
});
