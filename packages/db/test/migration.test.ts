// Proves that the migration which gave each course its own data keeps what was stored before it.
//
// The database gets the migrations from before there were courses and rows written the way the
// server of that time wrote them. Then it gets the rest of the migrations, as production does.
import type { WireLog } from "@norsk/protocol";
import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";

import { createDb } from "../src/index";
import { entry, mem, meta, request } from "./fixtures";

/** The first migration that knows about courses. */
const COURSES = "0004_courses.sql";

const db = createDb(env.DB);

const run = async (sql: string, ...values: (string | number)[]) => {
  await env.DB.prepare(sql)
    .bind(...values)
    .run();
};

const before = () => {
  const at = env.MIGRATIONS.findIndex(
    (migration) => migration.name === COURSES
  );

  expect(at).toBeGreaterThan(0);

  return env.MIGRATIONS.slice(0, at);
};

/** Stores log entries with the statement the server ran before there were courses. */
const addLogAsBefore = async (entries: readonly WireLog[]) => {
  await run(
    "INSERT OR IGNORE INTO log (uid, data) SELECT json_extract(value, '$.uid'), value FROM json_each(?1)",
    JSON.stringify(entries)
  );
};

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, before());
});

test("rows stored before there were courses become the first course, unchanged", async () => {
  const settings = meta({ days: ["2026-11-17"], totalMs: 754_000 });

  await run("UPDATE state SET value = 7 WHERE key = 'rev'");
  await run("UPDATE state SET value = 1700 WHERE key = 'epoch'");
  await run(
    "INSERT INTO memory (id, data, stamp, rev) VALUES ('a', ?1, 1000, 3), ('b', ?2, 2000, 7)",
    JSON.stringify(mem("a", 1000)),
    JSON.stringify(mem("b", 2000, 4))
  );
  await addLogAsBefore([entry("u1"), entry("u2"), entry("u3")]);
  await run(
    "INSERT INTO meta (id, data) VALUES (1, ?1)",
    JSON.stringify(settings)
  );

  await applyD1Migrations(env.DB, env.MIGRATIONS);

  const answer = await db.exchange(request());

  expect(answer).toEqual({
    epoch: 1700,
    log: [entry("u1"), entry("u2"), entry("u3")],
    logSeq: 3,
    memRev: 7,
    memory: [mem("a", 1000), mem("b", 2000, 4)],
    meta: settings,
    more: false,
    reset: false,
  });

  // No other course got any of it.
  expect(await db.exchange(request({ course: "de" }))).toMatchObject({
    epoch: 0,
    log: [],
    memRev: 0,
    memory: [],
    meta: null,
  });
});

test("a device keeps its cursors: it receives only what is new", async () => {
  await run("UPDATE state SET value = 3 WHERE key = 'rev'");
  await run(
    "INSERT INTO memory (id, data, stamp, rev) VALUES ('a', ?1, 1000, 3)",
    JSON.stringify(mem("a", 1000))
  );
  await addLogAsBefore([entry("u1"), entry("u2")]);

  await applyD1Migrations(env.DB, env.MIGRATIONS);

  // Another device adds a memory and a log entry after the migration.
  await db.exchange(
    request({
      epoch: 0,
      log: [entry("u3")],
      logSeq: 2,
      memRev: 3,
      memory: [mem("b", 2000)],
    })
  );

  const answer = await db.exchange(request({ epoch: 0, logSeq: 2, memRev: 3 }));

  expect(answer.memory.map((m) => m.id)).toEqual(["b"]);
  expect(answer.log.map((l) => l.uid)).toEqual(["u3"]);
  expect(answer).toMatchObject({ logSeq: 3, memRev: 4 });
});

test("the log goes on counting where it stopped, also after its last rows were deleted", async () => {
  await addLogAsBefore([entry("u1"), entry("u2"), entry("u3")]);
  // "Start over" before the migration: the rows are gone, their numbers must not be given again.
  await run("DELETE FROM log");

  await applyD1Migrations(env.DB, env.MIGRATIONS);

  const answer = await db.exchange(request({ log: [entry("u4")] }));

  expect(answer.logSeq).toBe(4);
});

test("an empty database is migrated too", async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);

  expect(await db.exchange(request())).toMatchObject({
    epoch: 0,
    log: [],
    logSeq: 0,
    memRev: 0,
    memory: [],
  });
});

test("the journal is left as it was", async () => {
  await db.record([
    { at: 5, data: { step: 1 }, kind: "task.chosen", session: null, uid: "e1" },
  ]);

  await applyD1Migrations(env.DB, env.MIGRATIONS);

  const stored = await env.DB.prepare("SELECT uid, at, kind FROM event").all();

  expect(stored.results).toEqual([{ at: 5, kind: "task.chosen", uid: "e1" }]);
});
