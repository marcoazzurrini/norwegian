// Helpers shared by the tests. Not part of the public interface.
//
// A "world" is one sync server and one clock. A "device" is one browser profile in that world:
// its own IndexedDB, its own sign-in, its own connection. Launching a device again on the same
// IndexedDB is a restart of the app.
import "fake-indexeddb/auto";
import type { Card } from "@norsk/engine";
import {
  LOG_PAGE,
  mergeMeta,
  ResetRequestSchema,
  ROUTES,
  stampOf,
  SyncedMetaSchema,
  SyncRequestSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type {
  ResetRequest,
  SyncedMeta,
  SyncRequest,
  SyncResponse,
  WireLog,
  WireMem,
} from "@norsk/protocol";
import { IDBFactory as FakeFactory } from "fake-indexeddb";
import { wrap } from "idb";
import * as v from "valibot";

import { createLearner } from "./index";
import type { Learner } from "./index";

/** A fixed moment for tests that need a time. */
export const T0 = Date.UTC(2026, 10, 18, 8);

export const MINUTE = 60_000;

export const DAY = 86_400_000;

export const EMAIL = "learner@example.com";

/** Fails the test when a value is missing, and narrows the type for the code after it. */
export const must = <Value>(value: Value | null | undefined): Value => {
  if (value === null || value === undefined) {
    throw new Error("A value the test needs is missing");
  }

  return value;
};

/** The message of the error that `task` fails with. Fails the test if it does not fail. */
export const failure = async (task: Promise<unknown>): Promise<string> => {
  try {
    await task;
  } catch (error) {
    return error instanceof Error ? error.message : "Failed without an error";
  }

  throw new Error("This was expected to fail");
};

/** Runs the tasks one after another. */
export const inOrder = async (
  tasks: readonly (() => Promise<void>)[]
): Promise<void> => {
  const [first, ...rest] = tasks;

  if (first !== undefined) {
    await first();
    await inOrder(rest);
  }
};

// ---- The server ----

/** Records that no version of the app can read: each lacks fields a real one has. */
export interface Spoiled {
  memory?: readonly Partial<WireMem>[];
  log?: readonly Partial<WireLog>[];
}

/** The calendar day of a moment, as the counters hold it. */
export const dayOf = (at: number): string =>
  new Date(at).toLocaleDateString("sv-SE");

export interface Server {
  /** Answers one request as the real server does (`apps/api`): same rules, kept in memory. */
  handle: (path: string, body: string) => Response;
  /** Every sync request received, oldest first. */
  syncs: () => readonly SyncRequest[];
  /** Every reset request received, oldest first. */
  resets: () => readonly ResetRequest[];
  /** Adds unreadable records to the next sync answer. */
  spoil: (records: Spoiled) => void;
  /** Makes the next answer something that is not a sync answer at all. */
  garble: () => void;
  memory: () => WireMem[];
  log: () => WireLog[];
  meta: () => SyncedMeta | null;
  epoch: () => number;
  /** The revision of the newest memory, which is the cursor a device in step holds. */
  rev: () => number;
}

/** An answer that says no, with its HTTP status. */
const refuse = (error: string, status: number): Response =>
  Response.json({ error }, { status });

export const createServer = (): Server => {
  let epoch = 0;
  let rev = 0;
  let seq = 0;
  let meta: SyncedMeta | null = null;
  let memory = new Map<string, { data: WireMem; rev: number }>();
  let log: { data: WireLog; seq: number }[] = [];
  let spoiled: Spoiled = {};
  let garbled = false;
  const syncs: SyncRequest[] = [];
  const resets: ResetRequest[] = [];

  const sync = (request: SyncRequest): SyncResponse => {
    // A device from an older generation (before a "Start over" elsewhere) must not bring old data back.
    const stale = request.epoch !== null && request.epoch < epoch;
    const current = request.epoch === epoch;
    const memRev = current ? request.memRev : 0;
    const logSeq = current ? request.logSeq : 0;
    const sentMemory = stale ? [] : request.memory;
    const sentLog = stale ? [] : request.log;
    const sentMeta = stale ? null : request.meta;

    if (sentMemory.length > 0) {
      rev += 1;
    }

    for (const mem of sentMemory) {
      const have = memory.get(mem.id);

      if (have === undefined || stampOf(mem) > stampOf(have.data)) {
        memory.set(mem.id, { data: mem, rev });
      }
    }

    const known = new Set(log.map((row) => row.data.uid));

    for (const entry of sentLog) {
      if (!known.has(entry.uid)) {
        seq += 1;
        known.add(entry.uid);
        log.push({ data: entry, seq });
      }
    }

    if (sentMeta !== null) {
      meta = meta === null ? sentMeta : mergeMeta(meta, sentMeta);
    }

    // The device already has what it just sent.
    const sentStamps = new Map(sentMemory.map((mem) => [mem.id, stampOf(mem)]));
    const sentUids = new Set(sentLog.map((entry) => entry.uid));
    const waiting = log.filter((row) => row.seq > logSeq);
    const page = waiting.slice(0, LOG_PAGE);

    return {
      epoch,
      log: page.flatMap((row) =>
        sentUids.has(row.data.uid) ? [] : [row.data]
      ),
      logSeq: page.at(-1)?.seq ?? logSeq,
      memRev: rev,
      memory: [...memory.values()].flatMap((row) =>
        row.rev > memRev && sentStamps.get(row.data.id) !== stampOf(row.data)
          ? [row.data]
          : []
      ),
      meta,
      more: waiting.length > LOG_PAGE,
      reset: stale,
    };
  };

  const answerSync = (body: string): Response => {
    const request = v.safeParse(SyncRequestSchema, JSON.parse(body));

    if (!request.success) {
      return refuse("Bad request", 400);
    }

    syncs.push(request.output);

    const answer = sync(request.output);

    if (garbled) {
      garbled = false;

      return Response.json({ hello: "world" });
    }

    const extra = spoiled;

    spoiled = {};

    return Response.json({
      ...answer,
      log: [...answer.log, ...(extra.log ?? [])],
      memory: [...answer.memory, ...(extra.memory ?? [])],
    });
  };

  const answerReset = (body: string): Response => {
    const request = v.safeParse(ResetRequestSchema, JSON.parse(body));

    if (!request.success) {
      return refuse("Bad request", 400);
    }

    resets.push(request.output);

    if (request.output.epoch < epoch) {
      return refuse("A newer reset already happened", 409);
    }

    if (request.output.epoch > epoch) {
      ({ epoch } = request.output);
      memory = new Map();
      log = [];
      meta = null;
    }

    return Response.json({ epoch });
  };

  return {
    epoch: () => epoch,

    garble: () => {
      garbled = true;
    },

    handle: (path, body) => {
      if (path === ROUTES.sync) {
        return answerSync(body);
      }

      if (path === ROUTES.reset) {
        return answerReset(body);
      }

      return refuse("Not found", 404);
    },

    log: () => log.map((row) => row.data),
    memory: () => [...memory.values()].map((row) => row.data),
    meta: () => meta,
    resets: () => resets,
    rev: () => rev,

    spoil: (records) => {
      spoiled = records;
    },

    syncs: () => syncs,
  };
};

// ---- A device ----

/** The error a write fails with once the app has been "stopped". */
export const STOPPED = "The app was stopped";

/**
 * An IndexedDB that can cut the power: once `budget.left` writes have been made, every later
 * write fails, as if the app had been closed at that moment. What was written stays.
 */
const stoppable = (
  inner: IDBFactory,
  budget: { left: number }
): IDBFactory => ({
  cmp: (first, second) => inner.cmp(first, second),
  databases: async () => await inner.databases(),
  deleteDatabase: (name) => inner.deleteDatabase(name),

  open: (name, version) => {
    const request = inner.open(name, version);

    request.addEventListener("success", () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);

      db.transaction = (names, mode, options) => {
        if (mode === "readwrite") {
          if (budget.left <= 0) {
            throw new Error(STOPPED);
          }

          budget.left -= 1;
        }

        return transaction(names, mode, options);
      };
    });

    return request;
  },
});

export interface Launch {
  /** How many writes to IndexedDB succeed before the app "stops". Unlimited when left out. */
  writes?: number;
}

export interface Device {
  /** Who the sign-in server says is signed in on this device. Null is signed out. */
  account: string | null;
  /** False cuts the connection: requests and the sign-in check fail. */
  online: boolean;
  /** Runs while a request is on its way back: the server has answered, the app has not seen the answer yet. */
  whileWaiting: () => Promise<void>;
  /** Makes ids for this device. Tests replace it to make id generation fail. */
  newId: () => string;
  /** This device's IndexedDB, for tests that put data in an older layout there first. */
  indexedDB: IDBFactory;
  /** Starts the app (again) on this device's IndexedDB and waits until its first sync has ended. */
  launch: (options?: Launch) => Promise<Learner>;
  /** The learner made by the last `launch`. */
  learner: () => Learner;
  /** Writes to IndexedDB made since the last `launch`. */
  writes: () => number;
  /** From now on, lets this many more writes succeed before the app "stops". */
  stopAfter: (writes: number) => void;
  /** The browser came online or the page became visible. */
  wake: () => void;
  /** Lets every pending timer fire. Returns how many there were. */
  runTimers: () => number;
  /** Waits until no sync is running. */
  idle: () => Promise<void>;
}

export interface World {
  clock: { now: number };
  server: Server;
  /** A new device, signed in as `EMAIL` and online. */
  device: (name: string) => Device;
}

const UNLIMITED = 1_000_000_000;

const createDevice = (world: World, name: string): Device => {
  const inner = new FakeFactory();
  const budget = { left: UNLIMITED, start: UNLIMITED };
  const timers = new Set<() => void>();
  const wakers = new Set<() => void>();
  let ids = 0;
  let current: Learner | null = null;

  const idle = async (): Promise<void> => {
    if (current?.syncStatus().busy === true) {
      await Bun.sleep(1);
      await idle();
    }
  };

  const device: Device = {
    account: EMAIL,
    idle,
    indexedDB: inner,

    launch: async (options = {}) => {
      current?.stop();
      budget.left = options.writes ?? UNLIMITED;
      budget.start = budget.left;

      const learner = createLearner({
        account: {
          currentUser: async () => {
            if (!device.online) {
              throw new TypeError("Failed to fetch");
            }

            return await Promise.resolve(device.account);
          },

          signIn: async () => {
            if (!device.online) {
              throw new TypeError("Failed to fetch");
            }

            device.account = EMAIL;
            await Promise.resolve();
          },

          signOut: async () => {
            device.account = null;
            await Promise.resolve();
          },
        },

        fetch: async (path, init) => {
          if (!device.online) {
            throw new TypeError("Failed to fetch");
          }

          if (device.account === null) {
            return refuse("Not signed in", 401);
          }

          const answer = world.server.handle(
            path,
            await new Response(init.body).text()
          );

          await device.whileWaiting();

          return answer;
        },

        host: {
          after: (_ms, task) => {
            timers.add(task);

            return () => {
              timers.delete(task);
            };
          },

          onWake: (listener) => {
            wakers.add(listener);

            return () => {
              wakers.delete(listener);
            };
          },
        },

        indexedDB: stoppable(inner, budget),
        newId: () => device.newId(),
        now: () => world.clock.now,
      });

      current = learner;
      await learner.start();
      await idle();

      return learner;
    },

    learner: () => must(current),

    newId: () => {
      ids += 1;

      return `${name}-${ids}`;
    },

    online: true,

    whileWaiting: async () => {
      await Promise.resolve();
    },

    runTimers: () => {
      const due = [...timers];

      timers.clear();

      for (const task of due) {
        task();
      }

      return due.length;
    },

    stopAfter: (writes) => {
      budget.left = writes;
      budget.start = writes;
    },

    wake: () => {
      for (const listener of wakers) {
        listener();
      }
    },

    writes: () => budget.start - budget.left,
  };

  return device;
};

export const createWorld = (): World => {
  const world: World = {
    clock: { now: T0 },
    device: (name) => createDevice(world, name),
    server: createServer(),
  };

  return world;
};

// ---- Looking at a device's data ----

const SnapshotSchema = v.object({
  log: v.array(WireLogSchema),
  memory: v.array(WireMemSchema),
  meta: SyncedMetaSchema,
});

export type Snapshot = v.InferOutput<typeof SnapshotSchema>;

/** Everything saved on the device, read through its backup file, in a fixed order. */
export const snapshot = async (learner: Learner): Promise<Snapshot> => {
  const backup = v.parse(
    SnapshotSchema,
    JSON.parse(await learner.exportBackup())
  );

  return {
    ...backup,
    log: backup.log.toSorted((a, b) => a.uid.localeCompare(b.uid)),
    memory: backup.memory.toSorted((a, b) => a.id.localeCompare(b.id)),
  };
};

/** The memories and the log, which signed-in devices share in full. */
export const shared = async (
  learner: Learner
): Promise<Pick<Snapshot, "log" | "memory">> => {
  const { log, memory } = await snapshot(learner);

  return { log, memory };
};

// ---- Data in the layout of earlier versions of the app ----

/** Anything JSON can hold. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A memory row. A test may leave fields out or put text where a number or date belongs. */
export interface OldMem {
  id: string;
  introducedAt: number;
  card: { [Field in keyof Card]?: Card[Field] | string };
}

export interface OldData {
  /** 1 had no indexes on the log and no `uid` on its rows; 2 is what the app used until this module. */
  version: 1 | 2;
  memory: readonly OldMem[];
  log: readonly (Omit<WireLog, "uid"> & { uid?: string })[];
  meta?: Record<string, Json>;
  sync?: Record<string, Json>;
}

/** Builds the IndexedDB database exactly as an earlier version of the app left it. */
export const seedOldLayout = async (
  factory: IDBFactory,
  data: OldData
): Promise<void> => {
  const request = factory.open("norsk", data.version);

  request.addEventListener("upgradeneeded", () => {
    const db = request.result;
    const memory = db.createObjectStore("memory", { keyPath: "id" });
    const log = db.createObjectStore("log", { autoIncrement: true });
    const meta = db.createObjectStore("meta");

    if (data.version === 2) {
      log.createIndex("at", "at");
      log.createIndex("uid", "uid", { unique: true });
    }

    for (const row of data.memory) {
      memory.put(row);
    }

    for (const row of data.log) {
      log.add(row);
    }

    if (data.meta !== undefined) {
      meta.put(data.meta, "meta");
    }

    if (data.sync !== undefined) {
      meta.put(data.sync, "sync");
    }
  });

  const db = must(await wrap(request));

  db.close();
};

const OldUidsSchema = v.array(v.looseObject({ uid: v.optional(v.string()) }));

/** The version of the database on the device and the `uid` of each log row, as they are saved. */
export const inspectLog = async (
  factory: IDBFactory
): Promise<{ version: number; uids: (string | undefined)[] }> => {
  const db = must(await wrap(factory.open("norsk")));
  const rows = v.parse(OldUidsSchema, await db.getAll("log"));

  db.close();

  return { uids: rows.map((row) => row.uid), version: db.version };
};

/** The log saved on the device. */
export const logOf = async (learner: Learner): Promise<WireLog[]> => {
  const { log } = await snapshot(learner);

  return log;
};
