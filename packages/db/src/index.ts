// The learner's data on the server.
//
// Hides: SQL and Drizzle, the tables, the `rev` and `epoch` counters, how one exchange is made a
// single transaction, and how the log is handed out in pages. A caller sends a sync request and
// gets the answer; it cannot tell how either is stored.
import {
  LOG_PAGE,
  mergeMeta,
  stampOf,
  SyncedMetaSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type {
  SyncedMeta,
  SyncRequest,
  SyncResponse,
  WireLog,
  WireMem,
} from "@norsk/protocol";
import { eq, gt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import * as v from "valibot";

import { log, memory, meta, state } from "./schema";

/** A stored row that this version cannot read. It is left in the database as it is. */
export interface UnreadableRow {
  table: "memory" | "log" | "meta";
  /** The row's key: the item id, the log sequence number, or "1" for the settings. */
  key: string;
}

export interface DbOptions {
  /** Called for each stored row that is skipped. By default the row is written to the log. */
  onUnreadableRow?: (row: UnreadableRow) => void;
}

export interface Db {
  /**
   * One step of sync: stores what the device sends and answers with what it lacks.
   * A device from before the last "Start over" has none of its data stored, and is told to reset.
   */
  exchange: (request: SyncRequest) => Promise<SyncResponse>;
  /**
   * "Start over": deletes everything and begins the data generation `epoch`.
   * Returns false, and changes nothing, if a later generation has already begun.
   */
  reset: (epoch: number) => Promise<boolean>;
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

  const counters = async () => {
    const rows = await db.select().from(state);
    const get = (key: string) => rows.find((r) => r.key === key)?.value ?? 0;

    return { epoch: get("epoch"), rev: get("rev") };
  };

  /** The stored settings. `readable` is false if there is a row that could not be read. */
  const storedMeta = async (): Promise<{
    meta: SyncedMeta | null;
    readable: boolean;
  }> => {
    const [row] = await db.select().from(meta).where(eq(meta.id, 1));

    if (row === undefined) {
      return { meta: null, readable: true };
    }

    const parsed = read(
      SyncedMetaSchema,
      { key: "1", table: "meta" },
      row.data
    );

    return { meta: parsed ?? null, readable: parsed !== undefined };
  };

  const nothing = () => db.run(sql`SELECT 1`);

  /** Adds the memories, each under the new revision number. A stored copy is replaced only by one reviewed later. */
  const upsertMemory = (mems: readonly WireMem[]) =>
    db
      .insert(memory)
      .select(
        sql`SELECT json_extract(value, '$.id'), json_extract(value, '$.data'), json_extract(value, '$.stamp'),
                   (SELECT value FROM state WHERE key = 'rev')
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
        target: memory.id,
      });

  /** Adds the log entries. One that is already stored, by its `uid`, is left alone. */
  const insertLog = (entries: readonly WireLog[]) =>
    db
      .insert(log)
      .select(
        // NULL for `seq`: the database numbers the entry.
        sql`SELECT NULL, json_extract(value, '$.uid'), value
            FROM json_each(${JSON.stringify(entries)}) WHERE true`
      )
      .onConflictDoNothing({ target: log.uid });

  const exchange = async (request: SyncRequest): Promise<SyncResponse> => {
    const { epoch } = await counters();
    // A device from an older generation (before a "Start over" elsewhere) must not bring old data back.
    const stale = request.epoch !== null && request.epoch < epoch;
    const current = request.epoch === epoch;
    const memRev = current ? request.memRev : 0;
    const logSeq = current ? request.logSeq : 0;
    const sentMemory = stale ? [] : request.memory;
    const sentLog = stale ? [] : request.log;
    const sentMeta = stale ? null : request.meta;

    const stored = await storedMeta();

    const merged =
      stored.meta && sentMeta
        ? mergeMeta(stored.meta, sentMeta)
        : (sentMeta ?? stored.meta);

    // Settings that could not be read are not overwritten: they may still hold something of value.
    const saveMeta = sentMeta !== null && merged !== null && stored.readable;

    // One batch is one transaction, so the changes and the reads after them see the same state.
    const results = await db.batch([
      sentMemory.length > 0
        ? db
            .update(state)
            .set({ value: sql`${state.value} + 1` })
            .where(eq(state.key, "rev"))
        : nothing(),
      sentMemory.length > 0 ? upsertMemory(sentMemory) : nothing(),
      sentLog.length > 0 ? insertLog(sentLog) : nothing(),
      saveMeta
        ? db
            .insert(meta)
            .values({ data: JSON.stringify(merged), id: 1 })
            .onConflictDoUpdate({
              set: { data: sql`excluded.data` },
              target: meta.id,
            })
        : nothing(),
      db
        .select({ data: memory.data, id: memory.id })
        .from(memory)
        .where(gt(memory.rev, memRev)),
      db
        .select({ data: log.data, seq: log.seq })
        .from(log)
        .where(gt(log.seq, logSeq))
        .orderBy(log.seq)
        .limit(LOG_PAGE + 1),
      db.select({ value: state.value }).from(state).where(eq(state.key, "rev")),
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
          read(WireLogSchema, { key: String(row.seq), table: "log" }, row.data)
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
            { key: String(row.id), table: "memory" },
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

  const reset = async (epoch: number): Promise<boolean> => {
    const now = await counters();

    if (!Number.isFinite(epoch) || epoch < now.epoch) {
      return false;
    }

    if (epoch > now.epoch) {
      await db.batch([
        db.delete(memory),
        db.delete(log),
        db.delete(meta),
        db.update(state).set({ value: epoch }).where(eq(state.key, "epoch")),
      ]);
    }

    return true;
  };

  return { exchange, reset };
};
