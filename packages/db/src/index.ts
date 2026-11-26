// The learner's data on the server.
//
// Hides: SQL and Drizzle, the tables, the `rev` and `epoch` counters, how one exchange is made a
// single transaction, how the log is handed out in pages, and how the data of one course is kept
// apart from the data of another. A caller sends a sync request and gets the answer; it cannot
// tell how either is stored.
import {
  LOG_PAGE,
  mergeMeta,
  stampOf,
  SyncedMetaSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type {
  CourseId,
  JournalEvent,
  SyncedMeta,
  SyncRequest,
  SyncResponse,
  WireLog,
  WireMem,
} from "@norsk/protocol";
import { and, eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as v from "valibot";

import { event, log, memory, meta, state } from "./schema";

/** A stored row that this version cannot read. It is left in the database as it is. */
export interface UnreadableRow {
  course: CourseId;
  table: "memory" | "log" | "meta";
  /** The row's key within its course: the item id, the log sequence number, or "settings". */
  key: string;
}

export interface DbOptions {
  /** Called for each stored row that is skipped. By default the row is written to the log. */
  onUnreadableRow?: (row: UnreadableRow) => void;
}

export interface Db {
  /**
   * One step of sync in the request's course: stores what the device sends and answers with what
   * it lacks. A device from before the course's last "Start over" has none of its data stored,
   * and is told to reset.
   */
  exchange: (request: SyncRequest) => Promise<SyncResponse>;
  /**
   * "Start over" in one course: deletes everything of that course and begins its data generation
   * `epoch`. The other courses are left alone.
   * Returns false, and changes nothing, if a later generation has already begun.
   */
  reset: (course: CourseId, epoch: number) => Promise<boolean>;
  /** Adds events to the journal. One that is already stored, by its `uid`, is left alone. */
  record: (events: readonly JournalEvent[]) => Promise<void>;
}

const warn = (row: UnreadableRow) => {
  console.warn({ event: "db.unreadable_row", ...row });
};

export const createDb = (d1: D1Database, options: DbOptions = {}): Db => {
  const db = drizzle(d1);
  const skipped = options.onUnreadableRow ?? warn;

  /**
   * Rows were written by earlier versions of the server, which checked less.
   * One that does not fit is reported and skipped, so it cannot fail the whole exchange.
   */
  const read = <Schema extends v.GenericSchema>(
    schema: Schema,
    row: UnreadableRow,
    data: string
  ): v.InferOutput<Schema> | undefined => {
    try {
      return v.parse(schema, JSON.parse(data));
    } catch {
      skipped(row);

      return undefined;
    }
  };

  const counters = async (course: CourseId) => {
    const rows = await db.select().from(state).where(eq(state.course, course));
    // A course that nothing was stored for yet has no rows, and counts from 0.
    const get = (key: string) => rows.find((r) => r.key === key)?.value ?? 0;

    return { epoch: get("epoch"), rev: get("rev") };
  };

  /** Sets a counter of a course, or changes it with `next` if the course already has it. */
  const count = (
    course: CourseId,
    key: "epoch" | "rev",
    first: number,
    next = sql`excluded.value`
  ) =>
    db
      .insert(state)
      .values({ course, key, value: first })
      .onConflictDoUpdate({
        set: { value: next },
        target: [state.course, state.key],
      });

  /** The stored settings of a course. `readable` is false if there is a row that could not be read. */
  const storedMeta = async (
    course: CourseId
  ): Promise<{
    meta: SyncedMeta | null;
    readable: boolean;
  }> => {
    const [row] = await db.select().from(meta).where(eq(meta.course, course));

    if (row === undefined) {
      return { meta: null, readable: true };
    }

    const parsed = read(
      SyncedMetaSchema,
      { course, key: "settings", table: "meta" },
      row.data
    );

    return { meta: parsed ?? null, readable: parsed !== undefined };
  };

  const nothing = () => db.run(sql`SELECT 1`);

  /** Adds the memories, each under the new revision number. A stored copy is replaced only by one reviewed later. */
  const upsertMemory = (course: CourseId, mems: readonly WireMem[]) =>
    db
      .insert(memory)
      .select(
        sql`SELECT ${course}, json_extract(value, '$.id'), json_extract(value, '$.data'), json_extract(value, '$.stamp'),
                   (SELECT value FROM state WHERE course = ${course} AND key = 'rev')
            FROM json_each(${JSON.stringify(
              mems.map((mem) => ({
                data: mem,
                id: mem.id,
                stamp: stampOf(mem),
              }))
            )}) WHERE true`
      )
      .onConflictDoUpdate({
        set: {
          data: sql`excluded.data`,
          rev: sql`excluded.rev`,
          stamp: sql`excluded.stamp`,
        },
        setWhere: sql`excluded.stamp > ${memory.stamp}`,
        target: [memory.course, memory.id],
      });

  /** Adds the log entries. One that the course already has, by its `uid`, is left alone. */
  const insertLog = (course: CourseId, entries: readonly WireLog[]) =>
    db
      .insert(log)
      .select(
        // NULL for `seq`: the database numbers the entry.
        sql`SELECT NULL, ${course}, json_extract(value, '$.uid'), value
            FROM json_each(${JSON.stringify(entries)}) WHERE true`
      )
      .onConflictDoNothing({ target: [log.course, log.uid] });

  const exchange = async (request: SyncRequest): Promise<SyncResponse> => {
    const { course } = request;
    const { epoch } = await counters(course);
    // A device from an older generation (before a "Start over" elsewhere) must not bring old data back.
    const stale = request.epoch !== null && request.epoch < epoch;
    const current = request.epoch === epoch;
    const memRev = current ? request.memRev : 0;
    const logSeq = current ? request.logSeq : 0;
    const sentMemory = stale ? [] : request.memory;
    const sentLog = stale ? [] : request.log;
    const sentMeta = stale ? null : request.meta;

    const stored = await storedMeta(course);

    const merged =
      stored.meta && sentMeta
        ? mergeMeta(stored.meta, sentMeta)
        : (sentMeta ?? stored.meta);

    // Settings that could not be read are not overwritten: they may still hold something of value.
    const saveMeta = sentMeta !== null && merged !== null && stored.readable;

    // One batch is one transaction, so the changes and the reads after them see the same state.
    const results = await db.batch([
      sentMemory.length > 0
        ? count(course, "rev", 1, sql`${state.value} + 1`)
        : nothing(),
      sentMemory.length > 0 ? upsertMemory(course, sentMemory) : nothing(),
      sentLog.length > 0 ? insertLog(course, sentLog) : nothing(),
      saveMeta
        ? db
            .insert(meta)
            .values({ course, data: JSON.stringify(merged) })
            .onConflictDoUpdate({
              set: { data: sql`excluded.data` },
              target: meta.course,
            })
        : nothing(),
      db
        .select({ data: memory.data, id: memory.id })
        .from(memory)
        .where(and(eq(memory.course, course), gt(memory.rev, memRev))),
      db
        .select({ data: log.data, seq: log.seq })
        .from(log)
        .where(and(eq(log.course, course), gt(log.seq, logSeq)))
        .orderBy(log.seq)
        .limit(LOG_PAGE + 1),
      db
        .select({ value: state.value })
        .from(state)
        .where(and(eq(state.course, course), eq(state.key, "rev"))),
    ]);

    // The first four results belong to the writes.
    const { 4: memRows, 5: logRows, 6: revRows } = results;

    // The device already has what it just sent.
    const sentStamps = new Map(sentMemory.map((mem) => [mem.id, stampOf(mem)]));
    const sentUids = new Set(sentLog.map((entry) => entry.uid));
    const page = logRows.slice(0, LOG_PAGE);

    return {
      epoch,
      log: page
        .map((row) =>
          read(
            WireLogSchema,
            { course, key: String(row.seq), table: "log" },
            row.data
          )
        )
        .filter((entry) => entry !== undefined)
        .filter((entry) => !sentUids.has(entry.uid)),
      // The cursor moves past a skipped entry too; otherwise the device would ask for it for ever.
      logSeq: page.at(-1)?.seq ?? logSeq,
      memRev: revRows[0]?.value ?? 0,
      memory: memRows
        .map((row) =>
          read(
            WireMemSchema,
            { course, key: row.id, table: "memory" },
            row.data
          )
        )
        .filter((mem) => mem !== undefined)
        .filter((mem) => sentStamps.get(mem.id) !== stampOf(mem)),
      meta: merged,
      more: logRows.length > LOG_PAGE,
      reset: stale,
    };
  };

  const reset = async (course: CourseId, epoch: number): Promise<boolean> => {
    const now = await counters(course);

    if (!Number.isFinite(epoch) || epoch < now.epoch) {
      return false;
    }

    if (epoch > now.epoch) {
      await db.batch([
        db.delete(memory).where(eq(memory.course, course)),
        db.delete(log).where(eq(log.course, course)),
        db.delete(meta).where(eq(meta.course, course)),
        count(course, "epoch", epoch),
      ]);
    }

    return true;
  };

  const record = async (events: readonly JournalEvent[]): Promise<void> => {
    if (events.length === 0) {
      return;
    }

    await db
      .insert(event)
      .select(
        // NULL for `seq`: the database numbers the event.
        sql`SELECT NULL, json_extract(value, '$.uid'), json_extract(value, '$.at'),
                   json_extract(value, '$.kind'), json_extract(value, '$.session'),
                   json_extract(value, '$.data')
            FROM json_each(${JSON.stringify(events)}) WHERE true`
      )
      .onConflictDoNothing({ target: event.uid });
  };

  return { exchange, record, reset };
};
