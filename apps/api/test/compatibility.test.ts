// The app that is installed on devices today keeps running for a while after this server is deployed.
// These requests are built the way that app builds them (apps/web/src/engine/sync.ts, store.ts and
// lib/explain.ts before the refactor), and the rows are stored the way the server before this one stored them.
import { env } from "cloudflare:workers";
import { describe, expect, test, vi } from "vitest";

import { onTheWire, post, result, signIn } from "./helpers";

const NOW = 1_795_000_000_000;

/** A memory as the scheduling library makes it and IndexedDB keeps it: with real dates. */
const mem = (id: string, reviewedAt: number) => ({
  card: {
    stability: 2.3065,
    difficulty: 2.1181,
    dueAt: new Date(reviewedAt + 300_000),
    lastReviewAt: new Date(reviewedAt),
    state: 1,
    scheduleStatus: "learning",
    cardId: id,
    reps: 1,
    lapses: 0,
    scheduledDays: 0,
    learningStep: 1,
  },
  id,
  introducedAt: NOW,
});

/** A memory after a lapse, with the state numbers only that case has. */
const lapsed = (id: string, reviewedAt: number) => ({
  card: {
    stability: 0.6974,
    difficulty: 9.9515,
    dueAt: new Date(reviewedAt + 300_000),
    lastReviewAt: new Date(reviewedAt),
    state: 3,
    scheduleStatus: "learning",
    cardId: id,
    reps: 401,
    lapses: 94,
    scheduledDays: 0,
    learningStep: 0,
  },
  id,
  introducedAt: NOW,
});

/** The whole local settings object, including the settings that belong to one device. */
const meta = {
  settings: {
    minutes: 15,
    desiredRetention: 0.9,
    voice: null,
    rate: 0.9,
    textScale: 1,
  },
  totalMs: 754_000,
  days: ["2026-11-17", "2026-11-18"],
  storiesDone: ["story-1"],
  chosenLesson: null,
  sentenceSeen: { "s:12": NOW - 5000 },
  sounds: { "y-u": { right: 3, total: 4 } },
  prefsAt: NOW - 86_400_000,
};

const log = [
  {
    uid: crypto.randomUUID(),
    id: "w:hus:noun",
    grade: "new",
    carrier: false,
    at: NOW,
  },
  {
    uid: crypto.randomUUID(),
    id: "w:hus:noun",
    grade: "good",
    carrier: true,
    at: NOW + 1,
  },
  {
    uid: crypto.randomUUID(),
    id: "w:bil:noun",
    grade: "again",
    carrier: false,
    at: NOW + 2,
  },
];

const memory = [mem("w:hus:noun", NOW + 1), lapsed("w:bil:noun", NOW + 2)];

/** The first message of a sync, with the keys in the order the app writes them. */
const firstMessage = {
  epoch: null,
  memRev: 0,
  logSeq: 0,
  memory,
  meta,
  log,
};

/** A device that has never synced and has nothing asks for everything. */
const emptyDevice = {
  epoch: null,
  memRev: 0,
  logSeq: 0,
  memory: [],
  meta: null,
  log: [],
};

// The statements below are the ones the server ran before this refactor, word for word.
const storeAsBefore = async () => {
  await env.DB.batch([
    env.DB.prepare("UPDATE state SET value = value + 1 WHERE key = 'rev'"),
    env.DB.prepare(
      `INSERT INTO memory (id, data, stamp, rev)
           SELECT json_extract(value, '$.id'), json_extract(value, '$.data'), json_extract(value, '$.stamp'),
                  (SELECT value FROM state WHERE key = 'rev')
           FROM json_each(?1) WHERE true
           ON CONFLICT (id) DO UPDATE SET data = excluded.data, stamp = excluded.stamp, rev = excluded.rev
           WHERE excluded.stamp > memory.stamp`
    ).bind(
      JSON.stringify(
        memory.map((m) => ({
          id: m.id,
          stamp: m.card.lastReviewAt.getTime(),
          data: m,
        }))
      )
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO log (uid, data) SELECT json_extract(value, '$.uid'), value FROM json_each(?1)"
    ).bind(JSON.stringify(log)),
    env.DB.prepare(
      "INSERT INTO meta (id, data) VALUES (1, ?1) ON CONFLICT (id) DO UPDATE SET data = excluded.data"
    ).bind(JSON.stringify(meta)),
  ]);
};

describe("the app in production", () => {
  test("its first sync is accepted whole, and answered as before", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await post("/api/sync", firstMessage, await signIn());

    expect(await result(response)).toEqual({
      body: {
        epoch: 0,
        log: [],
        logSeq: 3,
        memRev: 1,
        memory: [],
        // The settings come back as sent, with the ones that belong to this device.
        meta: onTheWire(meta),
        more: false,
        reset: false,
      },
      status: 200,
    });
    // Nothing was left out.
    expect(warned).not.toHaveBeenCalled();
  });

  test("another device receives exactly what was sent", async () => {
    const cookie = await signIn();

    await post("/api/sync", firstMessage, cookie);

    const { body } = await result(post("/api/sync", emptyDevice, cookie));

    expect(body).toEqual({
      epoch: 0,
      log: onTheWire(log),
      logSeq: 3,
      memRev: 1,
      memory: onTheWire(memory),
      meta: onTheWire(meta),
      more: false,
      reset: false,
    });
  });

  test("its follow-up messages, with cursors and nothing to send, are accepted", async () => {
    const cookie = await signIn();

    await post("/api/sync", firstMessage, cookie);

    expect(
      await result(
        post(
          "/api/sync",
          { epoch: 0, memRev: 1, logSeq: 3, memory: [], meta: null, log: [] },
          cookie
        )
      )
    ).toEqual({
      body: {
        epoch: 0,
        log: [],
        logSeq: 3,
        memRev: 1,
        memory: [],
        meta: onTheWire(meta),
        more: false,
        reset: false,
      },
      status: 200,
    });
  });

  test("a memory that was never reviewed is accepted", async () => {
    const fresh = {
      ...mem("w:ny:adj", NOW),
      card: { ...mem("w:ny:adj", NOW).card, lastReviewAt: null },
    };

    const response = await post(
      "/api/sync",
      { ...firstMessage, memory: [fresh] },
      await signIn()
    );

    expect(response.status).toBe(200);
  });

  test("its Start over, numbered by the clock, is accepted", async () => {
    const epoch = Date.now();

    expect(await result(post("/api/reset", { epoch }, await signIn()))).toEqual(
      { body: { epoch }, status: 200 }
    );
  });

  test("its sync after a Start over elsewhere is told to reset", async () => {
    const cookie = await signIn();

    await post("/api/sync", firstMessage, cookie);
    await post("/api/reset", { epoch: NOW }, cookie);

    const { body } = await result(
      post(
        "/api/sync",
        { ...firstMessage, epoch: 0, memRev: 1, logSeq: 3 },
        cookie
      )
    );

    expect(body).toEqual({
      epoch: NOW,
      log: [],
      logSeq: 0,
      memRev: 1,
      memory: [],
      meta: null,
      more: false,
      reset: true,
    });
  });

  test("its request for an explanation is accepted", async () => {
    // oxlint-disable-next-line require-await -- Stands in for `fetch`, which returns a promise.
    vi.stubGlobal("fetch", async () =>
      Response.json({ choices: [{ message: { content: "Check “en”." } }] })
    );

    const response = await post(
      "/api/explain",
      {
        kind: "explain",
        en: "I have a house.",
        no: "Jeg har et hus.",
        answer: "jeg har en hus",
        topics: ["hus (house)", "et word"],
      },
      await signIn()
    );

    expect(await result(response)).toEqual({
      body: { text: "Check “en”." },
      status: 200,
    });
  });
});

describe("rows stored by the server before this one", () => {
  test("are handed out unchanged, and none is skipped", async () => {
    const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

    await storeAsBefore();

    const { body } = await result(
      post("/api/sync", emptyDevice, await signIn())
    );

    expect(body).toEqual({
      epoch: 0,
      log: onTheWire(log),
      logSeq: 3,
      memRev: 1,
      memory: onTheWire(memory),
      meta: onTheWire(meta),
      more: false,
      reset: false,
    });
    expect(warned).not.toHaveBeenCalled();
  });

  test("are replaced only by a later review, as before", async () => {
    const cookie = await signIn();

    await storeAsBefore();
    await post(
      "/api/sync",
      {
        ...firstMessage,
        log: [],
        memory: [mem("w:hus:noun", NOW - 1000), mem("w:bil:noun", NOW + 5000)],
        meta: null,
      },
      cookie
    );

    const { body } = await result(post("/api/sync", emptyDevice, cookie));

    expect(body).toMatchObject({
      memRev: 2,
      // The first memory is unchanged; the second was replaced.
      memory: onTheWire([memory[0], mem("w:bil:noun", NOW + 5000)]),
    });
  });

  test("the same log entries sent again are not stored twice", async () => {
    const cookie = await signIn();

    await storeAsBefore();
    await post("/api/sync", firstMessage, cookie);

    const stored = await env.DB.prepare("SELECT count(*) AS n FROM log").first<{
      n: number;
    }>();

    expect(stored?.n).toBe(3);
  });
});
