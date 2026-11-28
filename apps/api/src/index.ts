// The server: sync, "Start over", explanations, sign-in, and recorded audio.
//
// Hides: nothing clever. Each route checks its input against the protocol, calls one package and
// answers. Static files are served by Cloudflare directly; this code handles /api/* and /audio/*.
import { createAuth } from "@norsk/auth";
import type { Auth, AuthEnv } from "@norsk/auth";
import { courseMeta } from "@norsk/courses";
import { createDb } from "@norsk/db";
import {
  AUDIO_FILE,
  AudioListRequestSchema,
  ExplainRequestSchema,
  JournalRequestSchema,
  ResetRequestSchema,
  ROUTES,
  SyncRequestSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type {
  AudioListResponse,
  ErrorBody,
  ExplainResponse,
  JournalResponse,
  ResetResponse,
  SyncResponse,
} from "@norsk/protocol";
import { Hono } from "hono";
import type { Context as HonoContext } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import * as v from "valibot";

import { explain } from "./explain";
import { logError, logInfo, logWarning } from "./log";

interface Env extends AuthEnv {
  AUDIO: R2Bucket;
  /** At most 30 explanations a minute for each learner (wrangler.jsonc). */
  EXPLAIN_LIMIT: RateLimit;
  /** Set with `wrangler secret put OPENROUTER_API_KEY`. Without it there are no explanations. */
  OPENROUTER_API_KEY?: string;
  /** For the audio build script. Set with `wrangler secret put SYNC_KEY`. */
  SYNC_KEY: string;
}

interface Context {
  Bindings: Env;
}

type Call = HonoContext<Context>;

const MAX_BODY = 4_000_000;
const NO_STORE = { "cache-control": "no-store" };

const refuse = (status: ContentfulStatusCode, message: string) =>
  new HTTPException(status, { message });

/** Compares two secrets without leaking, through timing, how much of the guess was right. */
const sameSecret = async (a: string, b: string): Promise<boolean> => {
  const encoder = new TextEncoder();

  // Hashes have the same length whatever the secrets are, which the comparison needs.
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  return crypto.subtle.timingSafeEqual(x, y);
};

let auth: Auth | undefined;

/** One instance per Worker instance: the settings never change while it runs. */
const authOf = (env: Env) => {
  auth ??= createAuth(env);

  return auth;
};

/**
 * The body of a sync request. A memory or log entry that does not fit the protocol is left out and
 * the rest is kept, as the server has always done: refusing the whole request would leave the
 * device unable to sync anything again. `dropped` says how many were left out.
 */
const SyncBodySchema = v.pipe(
  v.looseObject({ log: v.array(v.unknown()), memory: v.array(v.unknown()) }),
  v.transform((body) => {
    const log = body.log.filter((entry) => v.is(WireLogSchema, entry));
    const memory = body.memory.filter((mem) => v.is(WireMemSchema, mem));

    return {
      dropped:
        body.log.length + body.memory.length - log.length - memory.length,
      request: { ...body, log, memory },
    };
  }),
  v.object({ dropped: v.number(), request: SyncRequestSchema })
);

/** Refuses the request unless it carries the audio build script's secret key. */
const requireKey = async (c: Call) => {
  const given = c.req.header("authorization")?.replace(/^Bearer /u, "") ?? "";

  if (c.env.SYNC_KEY === "" || !(await sameSecret(given, c.env.SYNC_KEY))) {
    throw refuse(401, "Wrong key");
  }
};

/**
 * The signed-in learner and the JSON they sent. Everything under /api/ that is not sign-in or
 * audio starts here, so each of those routes refuses the same things in the same order.
 */
const learnerRequest = async (c: Call) => {
  if (c.req.method !== "POST") {
    throw refuse(405, "Use POST");
  }

  const user = await authOf(c.env).requireUser(c.req.raw);

  if (user instanceof Response) {
    // The auth package's refusal (401 or 403) is sent as it is.
    throw new HTTPException(401, { res: user });
  }

  const text = await c.req.text();

  if (text.length > MAX_BODY) {
    throw refuse(413, "Too much data in one request");
  }

  try {
    const body: unknown = JSON.parse(text);

    return { body, user };
  } catch {
    throw refuse(400, "Not JSON");
  }
};

const app = new Hono<Context>();

// Recorded audio is public and never changes: a new recording gets a new name.
app.get("/audio/*", async (c) => {
  const name = c.req.path.slice("/audio/".length);
  const recording = AUDIO_FILE.test(name) ? await c.env.AUDIO.get(name) : null;

  if (recording === null) {
    throw refuse(404, "Not found");
  }

  return new Response(recording.body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "audio/mpeg",
      etag: recording.httpEtag,
    },
  });
});

app.all("/api/auth/*", async (c) => await authOf(c.env).handler(c.req.raw));

// Recordings are uploaded by the audio build script, which has the secret key and no browser session.
app.put("/api/audio/*", async (c) => {
  await requireKey(c);

  const name = c.req.path.slice("/api/audio/".length);

  if (!AUDIO_FILE.test(name)) {
    throw refuse(404, "Not found");
  }

  const recording = await c.req.arrayBuffer();

  if (recording.byteLength > MAX_BODY) {
    throw refuse(413, "File too large");
  }

  await c.env.AUDIO.put(name, recording, {
    httpMetadata: { contentType: "audio/mpeg" },
  });

  return c.json({ ok: true }, 200, NO_STORE);
});

/** Names of all recordings of one voice, so the build script uploads only what is missing. */
app.post(ROUTES.audioList, async (c) => {
  await requireKey(c);

  const request = v.safeParse(
    AudioListRequestSchema,
    await c.req.json().catch(() => null)
  );

  if (!request.success) {
    throw refuse(400, "Not a voice");
  }

  const names: AudioListResponse = [];
  const options: R2ListOptions = { prefix: `${request.output.voice}/` };
  let more = true;

  while (more) {
    // oxlint-disable-next-line no-await-in-loop -- Each page can only be asked for with the cursor from the page before it.
    const page = await c.env.AUDIO.list(options);

    names.push(...page.objects.map((object) => object.key));
    more = page.truncated;

    if (page.truncated) {
      options.cursor = page.cursor;
    }
  }

  return c.json(names, 200, NO_STORE);
});

// With the key, anything else here is simply not there.
const noSuchUpload = async (c: Call) => {
  await requireKey(c);

  throw refuse(404, "Not found");
};

app.all("/api/audio/*", noSuchUpload);

app.all(ROUTES.audioList, noSuchUpload);

// Everything else under /api/ is for the signed-in learner, and takes JSON by POST.
app.post(ROUTES.sync, async (c) => {
  const { body, user } = await learnerRequest(c);
  const sent = v.safeParse(SyncBodySchema, body);

  if (!sent.success) {
    throw refuse(400, "Not a sync request");
  }

  const { dropped, request } = sent.output;
  const started = Date.now();

  const db = createDb(c.env.DB, {
    onUnreadableRow: (row) => {
      logWarning("sync.unreadable_row", {
        course: row.course,
        key: row.key,
        table: row.table,
      });
    },
  });

  const answer: SyncResponse = await db.exchange(request);

  if (dropped > 0) {
    logWarning("sync.dropped", {
      course: request.course,
      items: dropped,
      user: user.id,
    });
  }

  logInfo("sync", {
    course: request.course,
    logIn: request.log.length,
    logOut: answer.log.length,
    memoryIn: request.memory.length,
    memoryOut: answer.memory.length,
    metaIn: request.meta !== null,
    more: answer.more,
    ms: Date.now() - started,
    reset: answer.reset,
    user: user.id,
  });

  return c.json(answer, 200, NO_STORE);
});

/**
 * "Start over" in one course: deletes everything of that course and starts a new generation
 * there, so other devices drop their copies too. The other courses are left alone.
 */
app.post(ROUTES.reset, async (c) => {
  const { body, user } = await learnerRequest(c);
  const request = v.safeParse(ResetRequestSchema, body);

  if (!request.success) {
    throw refuse(400, "Not a reset request");
  }

  const { course, epoch } = request.output;

  if (!(await createDb(c.env.DB).reset(course, epoch))) {
    throw refuse(409, "A newer reset already happened");
  }

  logInfo("reset", { course, epoch, user: user.id });

  return c.json({ epoch } satisfies ResetResponse, 200, NO_STORE);
});

/** The journal: events from a device, kept to find out later why the app behaved as it did. */
app.post(ROUTES.journal, async (c) => {
  const { body, user } = await learnerRequest(c);
  const request = v.safeParse(JournalRequestSchema, body);

  if (!request.success) {
    throw refuse(400, "Not a journal request");
  }

  const { events } = request.output;
  const started = Date.now();

  await createDb(c.env.DB).record(events);

  logInfo("journal", {
    events: events.length,
    ms: Date.now() - started,
    user: user.id,
  });

  return c.json(
    { stored: events.length } satisfies JournalResponse,
    200,
    NO_STORE
  );
});

app.post(ROUTES.explain, async (c) => {
  const { body, user } = await learnerRequest(c);
  const apiKey = c.env.OPENROUTER_API_KEY;

  if (apiKey === undefined || apiKey === "") {
    throw refuse(503, "Explanations are not set up");
  }

  const request = v.safeParse(ExplainRequestSchema, body);

  if (!request.success) {
    throw refuse(400, "Missing fields");
  }

  const allowed = await c.env.EXPLAIN_LIMIT.limit({ key: user.id });

  if (!allowed.success) {
    throw refuse(429, "Too many explanations. Try again in a minute.");
  }

  const course = courseMeta(request.output.course);

  if (course === undefined) {
    throw refuse(400, "Unknown course");
  }

  const started = Date.now();
  const explanation = await explain(apiKey, course, request.output);

  logInfo("explain", {
    error: explanation.ok ? null : explanation.error,
    ms: Date.now() - started,
    ok: explanation.ok,
    status: explanation.ok ? 200 : explanation.status,
    user: user.id,
  });

  if (!explanation.ok) {
    throw refuse(explanation.status, explanation.error);
  }

  return c.json(
    { text: explanation.text } satisfies ExplainResponse,
    200,
    NO_STORE
  );
});

// Any other address under /api/ is refused like the ones above, then is not there.
app.all("/api/*", async (c) => {
  await learnerRequest(c);

  throw refuse(404, "Not found");
});

app.notFound((c) =>
  c.json({ error: "Not found" } satisfies ErrorBody, 404, NO_STORE)
);

// Every answer that is not a success has the same body: { error }.
app.onError((problem, c) => {
  const refused = problem instanceof HTTPException;

  // The auth package's refusals come ready-made, in the same form.
  if (refused && problem.res !== undefined) {
    return problem.res;
  }

  const status = refused ? problem.status : 500;

  if (status >= 500) {
    logError("error", {
      message: problem.message,
      method: c.req.method,
      name: problem.name,
      path: c.req.path,
      status,
    });
  }

  return c.json(
    { error: refused ? problem.message : "Server error" } satisfies ErrorBody,
    status,
    NO_STORE
  );
});

export default app;
