import { LOG_PAGE } from "@norsk/protocol";
import type { SyncResponse } from "@norsk/protocol";
import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, test } from "vitest";

import { createDb } from "../src/index";
import type { UnreadableRow } from "../src/index";
import { entry, mem, meta, request } from "./fixtures";

const unreadable: UnreadableRow[] = [];

const db = createDb(env.DB, {
  onUnreadableRow: (row) => {
    unreadable.push(row);
  },
});

/** The cursors a device keeps after an answer, as the next request sends them. */
const cursors = (answer: SyncResponse) => ({
  epoch: answer.epoch,
  logSeq: answer.logSeq,
  memRev: answer.memRev,
});

/** Everything the server holds, as a device that has never synced receives it. */
const everything = async () => {
  let answer = await db.exchange(request());
  const log = [...answer.log];

  while (answer.more) {
    // oxlint-disable-next-line no-await-in-loop -- Each page is asked for with the cursor from the page before it.
    answer = await db.exchange(request(cursors(answer)));
    log.push(...answer.log);
  }

  return { log, memory: answer.memory, meta: answer.meta };
};

const put = async (sql: string, ...values: string[]) => {
  await env.DB.prepare(sql)
    .bind(...values)
    .run();
};

/** The stored text of one row of the first course, as it is in the database. */
const storedData = async (table: "memory" | "meta", id?: string) => {
  const row = await env.DB.prepare(
    id === undefined
      ? `SELECT data FROM ${table} WHERE course = 'no'`
      : `SELECT data FROM ${table} WHERE course = 'no' AND id = ?1`
  )
    .bind(...(id === undefined ? [] : [id]))
    .first<{ data: string }>();

  return row?.data;
};

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.MIGRATIONS);
  unreadable.length = 0;
});

describe("a first sync", () => {
  test("an empty device and an empty server exchange nothing", async () => {
    expect(await db.exchange(request())).toEqual({
      epoch: 0,
      log: [],
      logSeq: 0,
      memRev: 0,
      memory: [],
      meta: null,
      more: false,
      reset: false,
    });
  });

  test("an empty device receives everything the server holds", async () => {
    await db.exchange(
      request({
        log: [entry("u1"), entry("u2")],
        memory: [mem("a", 1000), mem("b", null)],
        meta: meta({ totalMs: 5 }),
      })
    );

    const answer = await db.exchange(request());

    expect(answer.memory.map((m) => m.id).toSorted()).toEqual(["a", "b"]);
    expect(answer.log.map((l) => l.uid)).toEqual(["u1", "u2"]);
    expect(answer.meta).toEqual(meta({ totalMs: 5 }));
    expect(answer).toMatchObject({ logSeq: 2, memRev: 1, reset: false });
  });

  test("a memory comes back exactly as it was sent", async () => {
    const sent = mem("a", 1000);

    await db.exchange(request({ memory: [sent] }));

    const held = await everything();

    expect(held.memory).toEqual([sent]);
  });

  test("fields a newer version of the app added are kept", async () => {
    const sentMem = { ...mem("a", 1000), future: "kept" };
    const sentEntry = { ...entry("u1"), future: { deep: [1, 2] } };

    await db.exchange(request({ log: [sentEntry], memory: [sentMem] }));

    const held = await everything();

    expect(held.memory).toEqual([sentMem]);
    expect(held.log).toEqual([sentEntry]);
    expect(unreadable).toEqual([]);
  });
});

describe("memories", () => {
  test("an older review never replaces a newer one", async () => {
    await db.exchange(request({ memory: [mem("a", 2000, 2)] }));
    await db.exchange(request({ memory: [mem("a", 1000, 1)] }));

    const held = await everything();

    expect(held.memory).toEqual([mem("a", 2000, 2)]);
  });

  test("a copy with the same time does not replace the stored one", async () => {
    await db.exchange(request({ memory: [mem("a", 2000, 2)] }));
    await db.exchange(request({ memory: [mem("a", 2000, 9)] }));

    const held = await everything();

    expect(held.memory).toEqual([mem("a", 2000, 2)]);
  });

  test("a newer review replaces an older one", async () => {
    await db.exchange(request({ memory: [mem("a", 1000, 1)] }));
    await db.exchange(request({ memory: [mem("a", 2000, 2)] }));

    const held = await everything();

    expect(held.memory).toEqual([mem("a", 2000, 2)]);
  });

  test("a device that sent the older copy receives the newer one", async () => {
    await db.exchange(request({ memory: [mem("a", 2000, 2)] }));

    const answer = await db.exchange(request({ memory: [mem("a", 1000, 1)] }));

    expect(answer.memory).toEqual([mem("a", 2000, 2)]);
  });

  test("a device does not receive what it just sent", async () => {
    const answer = await db.exchange(
      request({ log: [entry("u1")], memory: [mem("a", 1000)] })
    );

    expect(answer.memory).toEqual([]);
    expect(answer.log).toEqual([]);
  });

  test("only memories changed after the device's cursor are sent", async () => {
    const first = await db.exchange(request({ memory: [mem("a", 1000)] }));

    await db.exchange(request({ memory: [mem("b", 1000)] }));

    const answer = await db.exchange(request(cursors(first)));

    expect(answer.memory.map((m) => m.id)).toEqual(["b"]);
    expect(answer.memRev).toBe(2);
  });

  test("a rejected older copy does not count as a change", async () => {
    const first = await db.exchange(request({ memory: [mem("a", 2000)] }));

    await db.exchange(request({ memory: [mem("a", 1000)] }));

    const answer = await db.exchange(request(cursors(first)));

    expect(answer.memory).toEqual([]);
  });
});

describe("the log", () => {
  test("the same entry sent twice is stored once", async () => {
    await db.exchange(request({ log: [entry("u1")] }));
    await db.exchange(request({ log: [entry("u1"), entry("u2")] }));

    const held = await everything();

    expect(held.log.map((l) => l.uid)).toEqual(["u1", "u2"]);
  });

  test("more entries than fit in one message arrive in pages, each once", async () => {
    const total = LOG_PAGE + 500;
    const uids = Array.from({ length: total }, (_, at) => `u${at}`);

    await db.exchange(
      request({ log: uids.slice(0, LOG_PAGE).map((uid) => entry(uid)) })
    );
    await db.exchange(
      request({ log: uids.slice(LOG_PAGE).map((uid) => entry(uid)) })
    );

    const first = await db.exchange(request());

    expect(first.log).toHaveLength(LOG_PAGE);
    expect(first).toMatchObject({ logSeq: LOG_PAGE, more: true });

    const second = await db.exchange(request(cursors(first)));

    expect(second.log).toHaveLength(500);
    expect(second).toMatchObject({ logSeq: total, more: false });
    expect([...first.log, ...second.log].map((l) => l.uid)).toEqual(uids);
  });

  test("exactly one full page leaves nothing waiting", async () => {
    await db.exchange(
      request({
        log: Array.from({ length: LOG_PAGE }, (_, at) => entry(`u${at}`)),
      })
    );

    const answer = await db.exchange(request());

    expect(answer.log).toHaveLength(LOG_PAGE);
    expect(answer.more).toBe(false);
  });

  test("a device that is up to date keeps its cursor", async () => {
    const first = await db.exchange(request({ log: [entry("u1")] }));
    const again = await db.exchange(request(cursors(first)));

    expect(again.log).toEqual([]);
    expect(again.logSeq).toBe(first.logSeq);
  });
});

describe("settings and counters", () => {
  test("two copies are merged and the device receives the result", async () => {
    await db.exchange(
      request({
        meta: meta({ chosenLesson: 3, days: ["2026-11-17"], prefsAt: 1 }),
      })
    );

    const answer = await db.exchange(
      request({
        meta: meta({
          chosenLesson: 7,
          days: ["2026-11-18"],
          prefsAt: 2,
          totalMs: 9,
        }),
      })
    );

    const merged = meta({
      chosenLesson: 7,
      days: ["2026-11-17", "2026-11-18"],
      prefsAt: 2,
      totalMs: 9,
    });

    const held = await everything();

    expect(answer.meta).toEqual(merged);
    expect(held.meta).toEqual(merged);
  });

  test("a device that sends none receives the stored copy and changes nothing", async () => {
    await db.exchange(request({ meta: meta({ totalMs: 5 }) }));

    const answer = await db.exchange(request());
    const again = await db.exchange(request());

    expect(answer.meta).toEqual(meta({ totalMs: 5 }));
    expect(again.meta).toEqual(meta({ totalMs: 5 }));
  });

  test("settings that belong to one device are kept", async () => {
    const sent = meta({
      settings: { desiredRetention: 0.9, minutes: 15, voice: "mia" },
    });

    await db.exchange(request({ meta: sent }));

    const held = await everything();

    expect(held.meta?.settings).toHaveProperty("voice", "mia");
  });
});

describe("Start over", () => {
  test("a newer generation deletes everything", async () => {
    await db.exchange(
      request({
        log: [entry("u1")],
        memory: [mem("a", 1000)],
        meta: meta(),
      })
    );

    expect(await db.reset("no", 100)).toBe(true);
    expect(await db.exchange(request())).toMatchObject({
      epoch: 100,
      log: [],
      memory: [],
      meta: null,
    });
  });

  test("the same generation again changes nothing", async () => {
    await db.reset("no", 100);
    await db.exchange(request({ epoch: 100, memory: [mem("a", 1000)] }));

    expect(await db.reset("no", 100)).toBe(true);

    const held = await everything();

    expect(held.memory).toHaveLength(1);
  });

  test("an older generation is refused and changes nothing", async () => {
    await db.reset("no", 100);
    await db.exchange(request({ epoch: 100, memory: [mem("a", 1000)] }));

    expect(await db.reset("no", 99)).toBe(false);
    expect(await db.exchange(request())).toMatchObject({ epoch: 100 });

    const held = await everything();

    expect(held.memory).toHaveLength(1);
  });

  test("a device from before it is told to reset, and none of its data is stored", async () => {
    await db.reset("no", 100);
    await db.exchange(request({ epoch: 100, memory: [mem("new", 1000)] }));

    const answer = await db.exchange(
      request({
        epoch: 0,
        log: [entry("old")],
        logSeq: 50,
        memRev: 50,
        memory: [mem("old", 5000)],
        meta: meta({ totalMs: 99 }),
      })
    );

    // Its cursors belong to the old generation, so it gets everything of the new one.
    expect(answer).toMatchObject({ epoch: 100, meta: null, reset: true });
    expect(answer.memory.map((m) => m.id)).toEqual(["new"]);

    const held = await everything();

    expect(held.memory.map((m) => m.id)).toEqual(["new"]);
    expect(held.log).toEqual([]);
    expect(held.meta).toBeNull();
  });

  test("a device that has never synced is not stale: its data is merged in", async () => {
    await db.reset("no", 100);

    const answer = await db.exchange(request({ memory: [mem("a", 1000)] }));

    const held = await everything();

    expect(answer).toMatchObject({ epoch: 100, reset: false });
    expect(held.memory).toHaveLength(1);
  });

  test("cursors from another generation are ignored", async () => {
    await db.exchange(
      request({ log: [entry("u1")], memory: [mem("a", 1000)] })
    );

    // A device that is ahead of the server's generation (its own reset has not arrived yet).
    const answer = await db.exchange(
      request({ epoch: 500, logSeq: 50, memRev: 50 })
    );

    expect(answer.memory).toHaveLength(1);
    expect(answer.log).toHaveLength(1);
    expect(answer.reset).toBe(false);
  });
});

describe("rows written by an earlier version", () => {
  test("a row that cannot be read is reported and skipped; the rest still arrives", async () => {
    await db.exchange(
      request({ log: [entry("u1")], memory: [mem("a", 1000)] })
    );
    await put(
      "INSERT INTO memory (course, id, data, stamp, rev) VALUES ('no', 'odd', ?1, 1, 1)",
      JSON.stringify({ card: { lastReviewAt: null }, id: "odd" })
    );
    await put(
      "INSERT INTO log (course, uid, data) VALUES ('no', 'odd', 'not json')"
    );
    await db.exchange(request({ log: [entry("u3")] }));
    unreadable.length = 0;

    const answer = await db.exchange(request());

    expect(answer.memory.map((m) => m.id)).toEqual(["a"]);
    expect(answer.log.map((l) => l.uid)).toEqual(["u1", "u3"]);
    expect(answer.logSeq).toBe(3);
    expect(unreadable).toEqual([
      { course: "no", key: "2", table: "log" },
      { course: "no", key: "odd", table: "memory" },
    ]);
  });

  test("a skipped row stays in the database", async () => {
    await put(
      "INSERT INTO memory (course, id, data, stamp, rev) VALUES ('no', 'odd', '{}', 1, 1)"
    );
    await db.exchange(request());

    expect(await storedData("memory", "odd")).toBe("{}");
  });

  test("settings that cannot be read are not overwritten", async () => {
    await put(
      "INSERT INTO meta (course, data) VALUES ('no', ?1)",
      '{"days":["x"]}'
    );

    const answer = await db.exchange(request({ meta: meta({ totalMs: 5 }) }));

    expect(answer.meta).toEqual(meta({ totalMs: 5 }));
    expect(await storedData("meta")).toBe('{"days":["x"]}');
    expect(unreadable).toEqual([
      { course: "no", key: "settings", table: "meta" },
    ]);
  });

  test("settings stored without the newer fields still merge", async () => {
    // The first version of the app stored settings without `sounds` or `prefsAt`.
    await put(
      "INSERT INTO meta (course, data) VALUES ('no', ?1)",
      JSON.stringify({
        days: ["2026-11-01"],
        settings: { desiredRetention: 0.9, minutes: 15, voice: null },
        totalMs: 7,
      })
    );

    const answer = await db.exchange(request({ meta: meta({ totalMs: 5 }) }));

    expect(answer.meta).toMatchObject({ days: ["2026-11-01"], totalMs: 7 });
    expect(unreadable).toEqual([]);
  });
});

/** A request in the German course. */
const german = (patch: Parameters<typeof request>[0] = {}) =>
  request({ ...patch, course: "de" });

describe("two courses", () => {
  test("each has its own memories, log and settings", async () => {
    await db.exchange(
      request({
        log: [entry("u1")],
        memory: [mem("a", 1000)],
        meta: meta({ totalMs: 5 }),
      })
    );

    expect(await db.exchange(german())).toEqual({
      epoch: 0,
      log: [],
      logSeq: 0,
      memRev: 0,
      memory: [],
      meta: null,
      more: false,
      reset: false,
    });

    await db.exchange(
      german({
        log: [entry("u2")],
        memory: [mem("b", 2000)],
        meta: meta({ totalMs: 9 }),
      })
    );

    const norwegian = await db.exchange(request());
    const other = await db.exchange(german());

    expect(norwegian.memory.map((m) => m.id)).toEqual(["a"]);
    expect(norwegian.log.map((l) => l.uid)).toEqual(["u1"]);
    expect(norwegian.meta).toEqual(meta({ totalMs: 5 }));
    expect(other.memory.map((m) => m.id)).toEqual(["b"]);
    expect(other.log.map((l) => l.uid)).toEqual(["u2"]);
    expect(other.meta).toEqual(meta({ totalMs: 9 }));
  });

  test("the same item id in both is two memories", async () => {
    await db.exchange(request({ memory: [mem("w:hus", 5000, 7)] }));
    // An older review: within one course it would lose against the stored copy.
    await db.exchange(german({ memory: [mem("w:hus", 1000, 1)] }));

    const norwegian = await db.exchange(request());
    const other = await db.exchange(german());

    expect(norwegian.memory.map((m) => m.card.reps)).toEqual([7]);
    expect(other.memory.map((m) => m.card.reps)).toEqual([1]);
  });

  test("the same log uid in both is two entries", async () => {
    await db.exchange(request({ log: [entry("u1", "w:hus")] }));
    await db.exchange(german({ log: [entry("u1", "w:haus")] }));

    const norwegian = await db.exchange(request());
    const other = await db.exchange(german());

    expect(norwegian.log.map((l) => l.id)).toEqual(["w:hus"]);
    expect(other.log.map((l) => l.id)).toEqual(["w:haus"]);
  });

  test("each counts its own revisions", async () => {
    await db.exchange(request({ memory: [mem("a", 1000)] }));
    await db.exchange(request({ memory: [mem("b", 1000)] }));

    const first = await db.exchange(german({ memory: [mem("c", 1000)] }));

    expect(first.memRev).toBe(1);
    expect(await db.exchange(request())).toMatchObject({ memRev: 2 });
  });

  test("a log cursor of one course skips nothing of that course", async () => {
    const first = await db.exchange(request({ log: [entry("u1")] }));

    await db.exchange(german({ log: [entry("u2")] }));
    await db.exchange(request({ log: [entry("u3")] }));

    const answer = await db.exchange(request(cursors(first)));
    const other = await db.exchange(german());

    expect(answer.log.map((l) => l.uid)).toEqual(["u3"]);
    expect(other.log.map((l) => l.uid)).toEqual(["u2"]);
  });

  test("Start over in one leaves the other alone", async () => {
    const sent = {
      log: [entry("u1")],
      memory: [mem("a", 1000)],
      meta: meta({ totalMs: 5 }),
    };

    await db.exchange(request(sent));
    await db.exchange(german(sent));

    expect(await db.reset("de", 100)).toBe(true);

    expect(await db.exchange(german())).toMatchObject({
      epoch: 100,
      log: [],
      memory: [],
      meta: null,
    });

    const norwegian = await db.exchange(request());

    expect(norwegian).toMatchObject({ epoch: 0, meta: meta({ totalMs: 5 }) });
    expect(norwegian.memory.map((m) => m.id)).toEqual(["a"]);
    expect(norwegian.log.map((l) => l.uid)).toEqual(["u1"]);
  });

  test("a device from before a Start over in another course is not stale", async () => {
    await db.reset("de", 100);

    const answer = await db.exchange(
      request({ epoch: 0, memory: [mem("a", 1000)] })
    );

    const held = await everything();

    expect(answer).toMatchObject({ epoch: 0, reset: false });
    expect(held.memory).toHaveLength(1);
  });

  test("an older Start over is refused in the course that has a newer one only", async () => {
    await db.reset("de", 100);

    expect(await db.reset("de", 50)).toBe(false);
    expect(await db.reset("no", 50)).toBe(true);
  });
});
