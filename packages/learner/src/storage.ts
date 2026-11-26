// Keeps the learner's data in IndexedDB. Nothing outside this file knows the layout.
//
// Each course has a database of its own. The first course keeps the name the app has always used
// ("norsk"), and the layout is the one it has always used (version 2), so data that is already on
// a device needs no migration:
//   memory  one row per item; the key is the row's `id`
//   log     one row per review; the key counts up; indexes `at` and `uid` (unique)
//   meta    two rows: "meta" holds the settings and counters, "sync" what is known about the server
//
// A review is saved in two steps: first its log entry, then the memory computed from it. Two fields
// that never leave this file tell, after a crash between the steps, which entries still need the
// second one: a log row made on this device has `local: true`, and a memory row has `seq`, the key of
// the last log row that existed when the memory was saved.
import type { Mem } from "@norsk/engine";
import { FIRST_COURSE } from "@norsk/protocol";
import { wrap } from "idb";
import type { IDBPDatabase, IDBPTransaction } from "idb";
import * as v from "valibot";

import {
  MemSchema,
  SavedEntriesSchema,
  SavedLogSchema,
  SavedMetaSchema,
  SavedSyncSchema,
} from "./records";
import type { LogEntry, Meta, SyncRecord } from "./records";

/** The database of the first course, which is older than courses. Every other course adds its name. */
const FIRST_NAME = "norsk";
const VERSION = 2;

const nameOf = (course: string): string =>
  course === FIRST_COURSE ? FIRST_NAME : `${FIRST_NAME}-${course}`;

const STORES = ["memory", "log", "meta"];

const SavedMemSchema = v.object({
  ...MemSchema.entries,
  // Rows saved before this field existed count as older than every entry made since.
  seq: v.optional(v.number(), 0),
});

/** Rows of the saved memories. A row that cannot be read becomes null: it is left where it is and not used. */
const SavedMemsSchema = v.array(v.fallback(v.nullable(SavedMemSchema), null));

/** A log row of version 1, which may lack its `uid`. Its other fields are kept as they are. */
const OldLogRowSchema = v.looseObject({
  uid: v.fallback(v.optional(v.string()), undefined),
});

export interface Saved {
  memory: Mem[];
  meta: Meta;
  sync: SyncRecord;
  /** Entries made on this device whose memory was not saved before the app stopped, oldest first. */
  unapplied: LogEntry[];
}

/** One answer of the server, saved in one step together with the cursors that say it was received. */
export interface Page {
  /** Drop every memory and log entry first. */
  wipe: boolean;
  memory: readonly Mem[];
  log: readonly LogEntry[];
  /** Left as it is when undefined. */
  meta: Meta | undefined;
  sync: SyncRecord;
}

/** New contents for everything. Without `meta`, the saved settings and counters are deleted. */
export interface Replacement {
  memory: readonly Mem[];
  log: readonly LogEntry[];
  meta: Meta | null;
  sync: SyncRecord;
}

export interface Storage {
  read: () => Promise<Saved>;
  /** Saves entries made on this device. Always call `putMemories` next, with the memories they lead to. */
  appendLog: (entries: readonly LogEntry[]) => Promise<void>;
  putMemories: (mems: readonly Mem[]) => Promise<void>;
  putMeta: (meta: Meta) => Promise<void>;
  putSync: (sync: SyncRecord) => Promise<void>;
  /** Every entry made at or after `at`, from this device or another. */
  logSince: (at: number) => Promise<LogEntry[]>;
  allLog: () => Promise<LogEntry[]>;
  applyPage: (page: Page) => Promise<void>;
  replaceAll: (next: Replacement) => Promise<void>;
  close: () => void;
}

type Transaction<Mode extends IDBTransactionMode> = IDBPTransaction<
  unknown,
  string[],
  Mode
>;

type Read = Transaction<"readonly">;

type Write = Transaction<"readwrite">;

/** Version 1 had no indexes and no `uid` on its log rows. */
const addLogIndexes = (
  transaction: IDBTransaction,
  newId: () => string
): void => {
  const log = transaction.objectStore("log");

  // Sync needs to find log entries by time and to tell entries from different devices apart.
  log.createIndex("at", "at");
  log.createIndex("uid", "uid", { unique: true });

  const walk = log.openCursor();

  walk.addEventListener("success", () => {
    const cursor = walk.result;

    if (cursor === null) {
      return;
    }

    try {
      const row = v.safeParse(OldLogRowSchema, cursor.value);

      if (row.success && (row.output.uid ?? "") === "") {
        cursor.update({ ...row.output, uid: newId() });
      }

      cursor.continue();
    } catch {
      // The upgrade is one transaction: giving up here leaves version 1 untouched, to be upgraded on the next start.
      transaction.abort();
    }
  });
};

const open = async (
  factory: IDBFactory,
  course: string,
  newId: () => string
): Promise<IDBPDatabase> => {
  const request = factory.open(nameOf(course), VERSION);

  request.addEventListener("upgradeneeded", (event) => {
    const { result, transaction } = request;

    if (event.oldVersion < 1) {
      result.createObjectStore("memory", { keyPath: "id" });
      result.createObjectStore("log", { autoIncrement: true });
      result.createObjectStore("meta");
    }

    if (event.oldVersion < 2 && transaction !== null) {
      addLogIndexes(transaction, newId);
    }
  });

  const db = await wrap(request);

  if (db === undefined) {
    throw new Error("The data on this device could not be opened");
  }

  // A later version of the app, open in another tab, must not wait for this one before it can upgrade the data.
  db.addEventListener("versionchange", () => {
    db.close();
  });

  return db;
};

const readMemory = async (
  tx: Read
): Promise<{ memory: Mem[]; seqs: Map<string, number> }> => {
  const rows = v.parse(
    SavedMemsSchema,
    await tx.objectStore("memory").getAll()
  );

  const memory: Mem[] = [];
  const seqs = new Map<string, number>();

  for (const row of rows) {
    if (row !== null) {
      const { seq, ...mem } = row;

      memory.push(mem);
      seqs.set(mem.id, seq);
    }
  }

  return { memory, seqs };
};

/**
 * Writes run one after another, so an entry without its memory can only be among the last rows.
 * Walks back from the end until the first row that is from elsewhere or already has its memory.
 */
const readUnapplied = async (
  tx: Read,
  seqs: ReadonlyMap<string, number>
): Promise<LogEntry[]> => {
  const unapplied: LogEntry[] = [];

  for await (const cursor of tx.objectStore("log").iterate(null, "prev")) {
    const row = v.safeParse(SavedLogSchema, cursor.value);

    if (!row.success || row.output.local !== true) {
      break;
    }

    const { local: _local, ...entry } = row.output;

    // An item that has no memory yet is older than any entry.
    if ((seqs.get(entry.id) ?? -1) >= Number(cursor.key)) {
      break;
    }

    unapplied.unshift(entry);
  }

  return unapplied;
};

const putMems = async (tx: Write, mems: readonly Mem[]): Promise<void> => {
  const last = await tx.objectStore("log").openKeyCursor(null, "prev");
  const seq = last === null ? 0 : Number(last.key);
  const memory = tx.objectStore("memory");

  await Promise.all(mems.map(async (mem) => await memory.put({ ...mem, seq })));
};

const addLog = async (
  tx: Write,
  rows: readonly (LogEntry & { local?: true })[]
): Promise<void> => {
  const log = tx.objectStore("log");

  await Promise.all(rows.map(async (row) => await log.add(row)));
};

/** Entries from the server may already be here: this device sent some of them itself. */
const addMissingLog = async (
  tx: Write,
  entries: readonly LogEntry[]
): Promise<void> => {
  const log = tx.objectStore("log");

  // Each id once: a second copy in the same answer would be refused and take the whole answer with it.
  const byUid = new Map(entries.map((entry) => [entry.uid, entry]));

  await Promise.all(
    [...byUid.values()].map(async (entry) => {
      const have = await log.index("uid").getKey(entry.uid);

      if (have === undefined) {
        await log.add(entry);
      }
    })
  );
};

/** Opens the data of one course on this device. */
export const openStorage = async (
  factory: IDBFactory,
  course: string,
  newId: () => string
): Promise<Storage> => {
  const db = await open(factory, course, newId);

  // Memories whose log entries are saved but whose own save failed. They go along with the next
  // save of memories, so a failure that passes costs nothing even if the app is not restarted.
  let owed: readonly Mem[] = [];

  /** Runs `work` in one transaction: either all of it is saved or none of it. */
  const inOne = async <Mode extends IDBTransactionMode, Result>(
    mode: Mode,
    work: (tx: Transaction<Mode>) => Promise<Result>
  ): Promise<Result> => {
    const tx = db.transaction(STORES, mode);

    try {
      const result = await work(tx);
      await tx.done;

      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // It had already ended.
      }

      await tx.done.catch(() => null);

      throw error;
    }
  };

  return {
    allLog: async () =>
      v
        .parse(SavedEntriesSchema, await db.getAll("log"))
        .filter((entry) => entry !== null),

    appendLog: async (entries) => {
      await inOne("readwrite", async (tx) => {
        await addLog(
          tx,
          entries.map((entry) => ({ ...entry, local: true }))
        );
      });
    },

    applyPage: async (page) => {
      await inOne("readwrite", async (tx) => {
        if (page.wipe) {
          await tx.objectStore("memory").clear();
          await tx.objectStore("log").clear();
        }

        await addMissingLog(tx, page.log);
        await putMems(tx, page.wipe ? page.memory : [...owed, ...page.memory]);

        if (page.meta !== undefined) {
          await tx.objectStore("meta").put(page.meta, "meta");
        }

        await tx.objectStore("meta").put(page.sync, "sync");
      });

      owed = [];
    },

    close: () => {
      db.close();
    },

    logSince: async (at) =>
      v
        .parse(
          SavedEntriesSchema,
          await db.getAllFromIndex("log", "at", IDBKeyRange.lowerBound(at))
        )
        .filter((entry) => entry !== null),

    putMemories: async (mems) => {
      const rows = [...owed, ...mems];

      try {
        await inOne("readwrite", async (tx) => {
          await putMems(tx, rows);
        });

        owed = [];
      } catch (error) {
        owed = rows;

        throw error;
      }
    },

    putMeta: async (meta) => {
      await db.put("meta", meta, "meta");
    },

    putSync: async (sync) => {
      await db.put("meta", sync, "sync");
    },

    read: async () =>
      await inOne("readonly", async (tx) => {
        const { memory, seqs } = await readMemory(tx);
        const info = tx.objectStore("meta");

        return {
          memory,
          meta: v.parse(SavedMetaSchema, await info.get("meta")),
          sync: v.parse(SavedSyncSchema, await info.get("sync")),
          unapplied: await readUnapplied(tx, seqs),
        };
      }),

    replaceAll: async (next) => {
      await inOne("readwrite", async (tx) => {
        await tx.objectStore("memory").clear();
        await tx.objectStore("log").clear();
        await addLog(tx, next.log);
        await putMems(tx, next.memory);

        await (next.meta === null
          ? tx.objectStore("meta").delete("meta")
          : tx.objectStore("meta").put(next.meta, "meta"));

        await tx.objectStore("meta").put(next.sync, "sync");
      });

      owed = [];
    },
  };
};
