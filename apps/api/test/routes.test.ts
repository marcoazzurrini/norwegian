import { createTestSession } from "@norsk/auth/testing";
import { env } from "cloudflare:workers";
import * as v from "valibot";
import { describe, expect, test, vi } from "vitest";

import worker from "../src/index";
import {
  EMPTY_SYNC,
  LEARNER,
  post,
  postText,
  result,
  send,
  signIn,
  SITE,
  withKey,
} from "./helpers";

const memory = {
  card: {
    cardId: "w:hus:noun",
    difficulty: 2.1181,
    dueAt: "2026-11-18T11:11:40.000Z",
    lapses: 0,
    lastReviewAt: "2026-11-18T11:06:40.000Z",
    learningStep: 1,
    reps: 1,
    scheduleStatus: "learning",
    scheduledDays: 0,
    stability: 2.3065,
    state: 1,
  },
  id: "w:hus:noun",
  introducedAt: 1_795_000_000_000,
};

const logEntry = {
  at: 1_795_000_000_000,
  carrier: false,
  grade: "new",
  id: "w:hus:noun",
  uid: "u-1",
};

const question = {
  answer: "jeg har en hus",
  en: "I have a house.",
  kind: "hint",
  no: "Jeg har et hus.",
  topics: ["hus", "et word"],
};

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/** Makes the language model answer with `response`, and returns what it was asked. */
const model = (response: () => Response) => {
  // oxlint-disable-next-line require-await -- Stands in for `fetch`, which returns a promise.
  const asked = vi.fn<Fetch>(async () => response());

  vi.stubGlobal("fetch", asked);

  return asked;
};

const completion = (content: string | null) => () =>
  Response.json({ choices: [{ message: { content } }] });

/** The part of a request to the model that the tests look at. */
const ModelRequestSchema = v.looseObject({
  messages: v.array(v.object({ content: v.string(), role: v.string() })),
});

/** What the model was asked the first time: the address, the request's settings, and its JSON body. */
const firstQuestion = (asked: ReturnType<typeof model>) => {
  const [address, init] = asked.mock.calls[0] ?? [];
  const body: unknown = JSON.parse(v.parse(v.string(), init?.body));

  return { address, body: v.parse(ModelRequestSchema, body), init };
};

const NAME = "mia/0123456789abcdef0123.mp3";
const SOUND = new Uint8Array([73, 68, 51, 4, 0, 0]);

const upload = async (
  name: string,
  body: BodyInit = SOUND,
  headers: Record<string, string> = withKey
) => await send(`/api/audio/${name}`, { body, headers, method: "PUT" });

const list = async (
  voice: string | undefined,
  headers: Record<string, string> = withKey
) =>
  await send("/api/audio-list", {
    body: JSON.stringify({ voice }),
    headers: { ...headers, "content-type": "application/json" },
    method: "POST",
  });

test("the tests use stand-in secrets, never the real ones", () => {
  expect(env).toMatchObject({
    ALLOWED_EMAILS: LEARNER,
    BETTER_AUTH_SECRET: "a-secret-for-tests-only-0123456789abcdef",
    BETTER_AUTH_URL: SITE,
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    OPENROUTER_API_KEY: "test-openrouter-key",
    SYNC_KEY: "test-sync-key",
  });
});

describe("who may use the API", () => {
  test.each(["/api/sync", "/api/reset", "/api/explain", "/api/nothing"])(
    "%s without a session answers 401",
    async (path) => {
      const response = await post(path, EMPTY_SYNC);

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Not signed in" });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  );

  test("a request from another website answers 403", async () => {
    const response = await post("/api/sync", EMPTY_SYNC, await signIn(), {
      origin: "https://evil.example",
    });

    expect(await result(response)).toEqual({
      body: { error: "Wrong origin" },
      status: 403,
    });
  });

  test("an address outside the list cannot use the API, even with a session", async () => {
    // The account was made while the address was still allowed.
    const cookie = await createTestSession(
      { ...env, ALLOWED_EMAILS: `${LEARNER},former@example.com` },
      "former@example.com"
    );

    expect(await result(post("/api/sync", EMPTY_SYNC, cookie))).toEqual({
      body: { error: "Not signed in" },
      status: 401,
    });
  });

  test.each(["GET", "PUT", "DELETE"])("%s answers 405", async (method) => {
    const response = await send("/api/sync", {
      headers: { cookie: await signIn() },
      method,
    });

    expect(await result(response)).toEqual({
      body: { error: "Use POST" },
      status: 405,
    });
  });

  test("sign-in is answered by the auth package", async () => {
    const response = await send("/api/auth/get-session");

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();

    const signedIn = await send("/api/auth/get-session", {
      headers: { cookie: await signIn() },
    });

    expect(await signedIn.json()).toMatchObject({ user: { email: LEARNER } });
  });
});

describe("requests that cannot be read", () => {
  test("a body that is not JSON answers 400", async () => {
    expect(
      await result(postText("/api/sync", "{not json", await signIn()))
    ).toEqual({ body: { error: "Not JSON" }, status: 400 });
  });

  test("a body over 4 MB answers 413", async () => {
    const body = JSON.stringify({ padding: "x".repeat(4_000_000) });

    expect(await result(postText("/api/sync", body, await signIn()))).toEqual({
      body: { error: "Too much data in one request" },
      status: 413,
    });
  });

  test("a body just under 4 MB is read", async () => {
    const body = JSON.stringify({
      ...EMPTY_SYNC,
      padding: "x".repeat(3_999_000),
    });

    const response = await postText("/api/sync", body, await signIn());

    expect(response.status).toBe(200);
  });

  test("an unknown address answers 404", async () => {
    expect(await result(post("/api/nothing", {}, await signIn()))).toEqual({
      body: { error: "Not found" },
      status: 404,
    });
    expect(await result(send("/elsewhere"))).toEqual({
      body: { error: "Not found" },
      status: 404,
    });
  });
});

describe("/api/sync", () => {
  test("stores what a device sends and gives it to the next device", async () => {
    const cookie = await signIn();

    const first = await post(
      "/api/sync",
      { ...EMPTY_SYNC, log: [logEntry], memory: [memory] },
      cookie
    );

    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await result(first)).toEqual({
      body: {
        epoch: 0,
        log: [],
        logSeq: 1,
        memRev: 1,
        memory: [],
        meta: null,
        more: false,
        reset: false,
      },
      status: 200,
    });

    expect(await result(post("/api/sync", EMPTY_SYNC, cookie))).toEqual({
      body: {
        epoch: 0,
        log: [logEntry],
        logSeq: 1,
        memRev: 1,
        memory: [memory],
        meta: null,
        more: false,
        reset: false,
      },
      status: 200,
    });
  });

  test.each([
    ["an array", []],
    ["a missing cursor", { ...EMPTY_SYNC, logSeq: undefined }],
    ["a negative cursor", { ...EMPTY_SYNC, memRev: -1 }],
    ["memories that are not a list", { ...EMPTY_SYNC, memory: {} }],
    [
      "settings without a session length",
      { ...EMPTY_SYNC, meta: { settings: {} } },
    ],
  ])("%s answers 400", async (_name, body) => {
    expect(await result(post("/api/sync", body, await signIn()))).toEqual({
      body: { error: "Not a sync request" },
      status: 400,
    });
  });

  test("an item that does not fit is left out; the rest is stored", async () => {
    const cookie = await signIn();
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await post(
      "/api/sync",
      {
        ...EMPTY_SYNC,
        log: [logEntry, { uid: "odd" }],
        memory: [memory, { card: {}, id: "odd" }, "odd"],
      },
      cookie
    );

    expect(response.status).toBe(200);
    expect(warned).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sync.dropped", items: 3 })
    );
    expect(await result(post("/api/sync", EMPTY_SYNC, cookie))).toMatchObject({
      body: { log: [logEntry], memory: [memory] },
    });
  });

  test("each sync is logged with counts and no contents", async () => {
    const cookie = await signIn();
    const logged = vi.spyOn(console, "log").mockImplementation(() => {});

    await post(
      "/api/sync",
      { ...EMPTY_SYNC, log: [logEntry], memory: [memory] },
      cookie
    );

    const entry = v.parse(v.looseObject({}), logged.mock.calls[0]?.[0]);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(entry).toMatchObject({
      event: "sync",
      logIn: 1,
      logOut: 0,
      memoryIn: 1,
      memoryOut: 0,
      metaIn: false,
      more: false,
      reset: false,
    });
    expect(Object.keys(entry).toSorted()).toEqual([
      "event",
      "logIn",
      "logOut",
      "memoryIn",
      "memoryOut",
      "metaIn",
      "more",
      "ms",
      "reset",
      "user",
    ]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("@");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("hus");
  });
});

describe("/api/reset", () => {
  test("a newer generation is accepted and empties the server", async () => {
    const cookie = await signIn();

    await post("/api/sync", { ...EMPTY_SYNC, memory: [memory] }, cookie);

    const response = await post("/api/reset", { epoch: 100 }, cookie);

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await result(response)).toEqual({
      body: { epoch: 100 },
      status: 200,
    });
    expect(await result(post("/api/sync", EMPTY_SYNC, cookie))).toMatchObject({
      body: { epoch: 100, memory: [] },
    });
  });

  test("the same generation again is accepted and changes nothing", async () => {
    const cookie = await signIn();

    await post("/api/reset", { epoch: 100 }, cookie);
    await post("/api/sync", { ...EMPTY_SYNC, memory: [memory] }, cookie);

    expect(await result(post("/api/reset", { epoch: 100 }, cookie))).toEqual({
      body: { epoch: 100 },
      status: 200,
    });
    expect(await result(post("/api/sync", EMPTY_SYNC, cookie))).toMatchObject({
      body: { memory: [memory] },
    });
  });

  test("an older generation answers 409", async () => {
    const cookie = await signIn();

    await post("/api/reset", { epoch: 100 }, cookie);

    expect(await result(post("/api/reset", { epoch: 99 }, cookie))).toEqual({
      body: { error: "A newer reset already happened" },
      status: 409,
    });
  });

  test.each([{}, { epoch: "soon" }, { epoch: -1 }, { epoch: 1.5 }])(
    "%j answers 400",
    async (body) => {
      expect(await result(post("/api/reset", body, await signIn()))).toEqual({
        body: { error: "Not a reset request" },
        status: 400,
      });
    }
  );
});

describe("/api/explain", () => {
  test("answers with the model's text", async () => {
    const asked = model(completion("  Look at “en” again.  "));
    const response = await post("/api/explain", question, await signIn());

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await result(response)).toEqual({
      body: { text: "Look at “en” again." },
      status: 200,
    });
    expect(asked).toHaveBeenCalledTimes(1);
  });

  test("asks the model exactly as before", async () => {
    const asked = model(completion("ok"));

    await post(
      "/api/explain",
      { ...question, answer: "  jeg   har\n en hus " },
      await signIn()
    );

    const { address, body: sent, init } = firstQuestion(asked);

    expect(address).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      authorization: "Bearer test-openrouter-key",
      "content-type": "application/json",
      "x-title": "Norsk",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(sent).toMatchObject({
      max_tokens: 300,
      model: "anthropic/claude-haiku-5.5",
      reasoning: { enabled: false },
      temperature: 0.2,
    });
    expect(Object.keys(sent).toSorted()).toEqual([
      "max_tokens",
      "messages",
      "model",
      "reasoning",
      "temperature",
    ]);
    expect(sent.messages.map((message) => message.role)).toEqual([
      "system",
      "user",
    ]);
    expect(sent.messages[0]?.content).toMatch(
      /^You help an English speaker who is a beginner in Norwegian \(Bokmål\)\./u
    );
    expect(sent.messages[1]?.content).toBe(
      [
        "English sentence: I have a house.",
        "Expected Norwegian: Jeg har et hus.",
        "Learner's answer: jeg har en hus",
        "The program marked these as the weak points: hus; et word",
        "",
        "Write a HINT for a second try. Say which word to look at again and what kind of thing to check (its ending, its place in the sentence, the choice of word). Do NOT write the correct word, the correct ending, the correct order or the correct sentence. The learner must still work it out.",
      ].join("\n")
    );
  });

  test("without weak points, and after the answer is shown, the question says so", async () => {
    const asked = model(completion("ok"));

    await post(
      "/api/explain",
      { ...question, kind: "explain", topics: [] },
      await signIn()
    );

    const { body: sent } = firstQuestion(asked);

    expect(sent.messages[1]?.content).toMatch(
      /^English sentence: I have a house\.\nExpected Norwegian: Jeg har et hus\.\nLearner's answer: jeg har en hus\n\nThe correct answer is now on screen\. EXPLAIN /u
    );
  });

  test.each([
    ["an unknown kind", { ...question, kind: "essay" }],
    ["an empty answer", { ...question, answer: "   " }],
    ["a missing sentence", { ...question, en: undefined }],
    ["no object at all", null],
  ])("%s answers 400 and the model is not asked", async (_name, body) => {
    const asked = model(completion("ok"));

    expect(await result(post("/api/explain", body, await signIn()))).toEqual({
      body: { error: "Missing fields" },
      status: 400,
    });
    expect(asked).not.toHaveBeenCalled();
  });

  test("an error from the model answers 502", async () => {
    model(() => new Response("busy", { status: 429 }));

    expect(
      await result(post("/api/explain", question, await signIn()))
    ).toEqual({
      body: { error: "The model answered with an error (429)" },
      status: 502,
    });
  });

  test.each([
    ["no choices", () => Response.json({ choices: [] })],
    ["empty text", completion("  ")],
    ["text that is not text", completion(null)],
    ["an answer that is not JSON", () => new Response("<html>")],
  ])("%s from the model answers 502", async (_name, response) => {
    model(response);

    expect(
      await result(post("/api/explain", question, await signIn()))
    ).toEqual({ body: { error: "The model gave no text" }, status: 502 });
  });

  test("a model that does not answer in time answers 504", async () => {
    model(() => {
      throw new DOMException("The operation timed out", "TimeoutError");
    });

    expect(
      await result(post("/api/explain", question, await signIn()))
    ).toEqual({
      body: { error: "The model did not answer in time" },
      status: 504,
    });
  });

  test("without a key for the model the answer is 503", async () => {
    const asked = model(completion("ok"));

    const response = await worker.fetch(
      new Request(`${SITE}/api/explain`, {
        body: JSON.stringify(question),
        headers: { cookie: await signIn(), origin: SITE },
        method: "POST",
      }),
      { ...env, OPENROUTER_API_KEY: "" }
    );

    expect(await result(response)).toEqual({
      body: { error: "Explanations are not set up" },
      status: 503,
    });
    expect(asked).not.toHaveBeenCalled();
  });

  test("more than 30 a minute answers 429, and the model is not asked again", async () => {
    const asked = model(completion("ok"));
    const cookie = await signIn();
    const statuses: number[] = [];

    // The limit counts per clock minute. If a new minute starts during the test, the count starts again, so allow for two.
    while (statuses.at(-1) !== 429 && statuses.length <= 60) {
      // oxlint-disable-next-line no-await-in-loop -- The limit counts requests one after another.
      const response = await post("/api/explain", question, cookie);

      statuses.push(response.status);
    }

    const allowed = statuses.length - 1;

    expect(statuses.at(-1)).toBe(429);
    expect(allowed).toBeGreaterThanOrEqual(30);
    expect(statuses.slice(0, allowed)).toEqual(
      Array.from({ length: allowed }, () => 200)
    );
    expect(asked).toHaveBeenCalledTimes(allowed);
    expect(await result(post("/api/explain", question, cookie))).toMatchObject({
      body: { error: "Too many explanations. Try again in a minute." },
    });
  });

  test("failures of the model are logged", async () => {
    model(() => new Response("busy", { status: 500 }));

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await post("/api/explain", question, await signIn());

    expect(logged).toHaveBeenCalledWith({
      event: "error",
      message: "The model answered with an error (500)",
      method: "POST",
      name: "Error",
      path: "/api/explain",
      status: 502,
    });
  });
});

describe("recorded audio", () => {
  test("the build script uploads a recording, lists it, and anyone can play it", async () => {
    const uploaded = await upload(NAME);

    expect(uploaded.headers.get("cache-control")).toBe("no-store");
    expect(await result(uploaded)).toEqual({ body: { ok: true }, status: 200 });
    expect(await result(list("mia"))).toEqual({ body: [NAME], status: 200 });
    expect(await result(list("other"))).toEqual({ body: [], status: 200 });

    // No key and no session: recordings are public.
    const played = await send(`/audio/${NAME}`);

    expect(played.status).toBe(200);
    expect(played.headers.get("content-type")).toBe("audio/mpeg");
    expect(played.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(played.headers.get("etag")).toMatch(/^"[0-9a-f]+"$/u);
    expect(new Uint8Array(await played.arrayBuffer())).toEqual(SOUND);
  });

  test("asking only for a recording's headers gets them without the sound", async () => {
    await upload(NAME);

    const headers = await send(`/audio/${NAME}`, { method: "HEAD" });

    expect(headers.status).toBe(200);
    expect(headers.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable"
    );
    expect(await headers.text()).toBe("");
  });

  test("a voice with more recordings than one page of the bucket is listed whole", async () => {
    const names = Array.from(
      { length: 1100 },
      (_, at) => `mia/${at.toString(16).padStart(20, "0")}.mp3`
    );

    await Promise.all(
      names.map(async (name) => await env.AUDIO.put(name, SOUND))
    );

    const { body } = await result(list("mia"));

    expect(body).toHaveLength(1100);
    expect(body).toEqual(names);
  });

  test.each([
    ["no key", {}],
    ["a wrong key", { authorization: "Bearer wrong" }],
    ["a session instead of the key", null],
  ])("%s answers 401", async (_name, headers) => {
    const given = headers ?? { cookie: await signIn() };

    expect(await result(upload(NAME, SOUND, given))).toEqual({
      body: { error: "Wrong key" },
      status: 401,
    });
    expect(await result(list("mia", given))).toEqual({
      body: { error: "Wrong key" },
      status: 401,
    });
    expect(await env.AUDIO.head(NAME)).toBeNull();
  });

  test("a name that is not a recording's answers 404", async () => {
    expect(await result(upload("mia/song.mp3"))).toEqual({
      body: { error: "Not found" },
      status: 404,
    });
    expect(await result(upload("Mia/0123456789abcdef0123.mp3"))).toMatchObject({
      status: 404,
    });
  });

  test("other methods on the upload addresses answer 404", async () => {
    expect(
      await result(send(`/api/audio/${NAME}`, { headers: withKey }))
    ).toEqual({ body: { error: "Not found" }, status: 404 });
    expect(await result(send("/api/audio-list", { headers: withKey }))).toEqual(
      { body: { error: "Not found" }, status: 404 }
    );
  });

  test("a recording over 4 MB answers 413 and is not stored", async () => {
    expect(await result(upload(NAME, new Uint8Array(4_000_001)))).toEqual({
      body: { error: "File too large" },
      status: 413,
    });
    expect(await env.AUDIO.head(NAME)).toBeNull();
  });

  test("a voice name that is not one answers 400", async () => {
    expect(await result(list("../secret"))).toEqual({
      body: { error: "Not a voice" },
      status: 400,
    });
    expect(await result(list(undefined))).toMatchObject({ status: 400 });
  });

  test("a recording that does not exist answers 404 and is not cached", async () => {
    const missing = await send(`/audio/${NAME}`);

    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await result(missing)).toEqual({
      body: { error: "Not found" },
      status: 404,
    });

    const outside = await send("/audio/../wrangler.jsonc");
    const posted = await send(`/audio/${NAME}`, { method: "POST" });

    expect(outside.status).toBe(404);
    expect(posted.status).toBe(404);
  });
});
