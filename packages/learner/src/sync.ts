// Keeps this device and the sync server in step. The app is only usable when signed in;
// a device that has signed in once keeps working from its own data without a connection.
import {
  LOG_PAGE,
  ResetResponseSchema,
  ROUTES,
  SyncedMetaSchema,
  SyncResponseSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type { ResetRequest, SyncRequest } from "@norsk/protocol";
import { Store } from "@tanstack/store";
import * as v from "valibot";

import type { Data, RemotePage } from "./data";
import type { SyncRecord } from "./records";
import type { Account, Fetch, Host, SyncStatus } from "./types";

/** How long after a change on this device the sync starts, so a burst of changes goes in one message. */
const QUIET_MS = 2500;

const SIGNED_OUT = 401;

/** Another device started over more recently. */
const NEWER_RESET = 409;

class SyncError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SyncError";
    this.status = status;
  }
}

const UNREADABLE = "The sync server sent an answer this app cannot read.";

const MetaSchema = v.nullable(SyncedMetaSchema);

/**
 * The server's answer to a sync. One record that this version of the app cannot read must not cost
 * the rest of the answer, so each record is checked on its own: a bad one is left out and counted.
 * The cursors still move past it, so the sync does not ask for it forever. The server keeps it.
 */
const AnswerSchema = v.pipe(
  v.object({
    ...SyncResponseSchema.entries,
    log: v.array(v.unknown()),
    memory: v.array(v.unknown()),
    meta: v.unknown(),
  }),
  v.transform(({ log, memory, meta, reset, ...cursors }) => {
    const mems = memory.map((mem) => v.safeParse(WireMemSchema, mem));
    const entries = log.map((entry) => v.safeParse(WireLogSchema, entry));
    const settings = v.safeParse(MetaSchema, meta);
    const read = [...mems, ...entries, settings];

    return {
      ...cursors,
      page: {
        log: entries.flatMap((entry) => (entry.success ? [entry.output] : [])),
        memory: mems.flatMap((mem) => (mem.success ? [mem.output] : [])),
        meta: settings.success ? settings.output : null,
        wipe: reset,
      } satisfies RemotePage,
      skipped: read.filter((result) => !result.success).length,
    };
  })
);

/** What is still to send in this sync, and what has been skipped so far. */
interface Outbox {
  memory: SyncRequest["memory"];
  meta: SyncRequest["meta"];
  log: SyncRequest["log"];
  skipped: number;
}

const notYet = (): void => {
  // Nothing to stop before the sync starts.
};

const nothing = (): void => {
  // A failure that someone else reports.
};

interface SyncDeps {
  data: Data;
  fetch: Fetch;
  now: () => number;
  account: Account;
  host: Host;
}

export interface Sync {
  status: Store<SyncStatus>;
  /** Call once, after the data has loaded. */
  start: () => Promise<void>;
  stop: () => void;
  syncNow: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  startOver: () => Promise<void>;
  restoreBackup: (json: string) => Promise<void>;
}

/** Cursors of a device that has not synced with its account yet: everything is sent and everything fetched. */
const UNSYNCED: Partial<SyncRecord> = {
  epoch: null,
  lastOkAt: null,
  logSeq: 0,
  memRev: 0,
  pendingReset: null,
  pushedAt: 0,
};

export const createSync = (deps: SyncDeps): Sync => {
  const { data } = deps;

  const status = new Store<SyncStatus>({
    account: null,
    busy: false,
    checked: false,
    error: null,
    lastOkAt: null,
    linked: false,
    skipped: 0,
  });

  const setStatus = (patch: Partial<SyncStatus>): void => {
    status.setState((state) => ({ ...state, ...patch }));
  };

  /** Sends one message and checks the answer against `schema`. */
  const post = async <Schema extends v.GenericSchema>(
    path: string,
    body: SyncRequest | ResetRequest,
    schema: Schema
  ): Promise<v.InferOutput<Schema>> => {
    let response: Response;

    try {
      response = await deps.fetch(path, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    } catch {
      throw new SyncError(
        "No connection. Your progress is saved on this device and will sync later.",
        0
      );
    }

    if (response.status === SIGNED_OUT) {
      throw new SyncError(
        "You are signed out. Sign in again to sync.",
        SIGNED_OUT
      );
    }

    if (!response.ok) {
      throw new SyncError(
        `The sync server answered with an error (${response.status}).`,
        response.status
      );
    }

    const answer = v.safeParse(schema, await response.json().catch(() => null));

    if (!answer.success) {
      throw new SyncError(UNREADABLE, 0);
    }

    return answer.output;
  };

  /** Marks this device as signed out. Progress stays on the device and on the server. */
  const forget = async (): Promise<void> => {
    await data.patchSync({ ...UNSYNCED, account: null });
    setStatus({ account: null, busy: false, lastOkAt: null, linked: false });
  };

  /** Tells the server about a "Start over" or "Restore backup" made on this device. */
  const confirmReset = async (epoch: number): Promise<void> => {
    try {
      await post(ROUTES.reset, { epoch }, ResetResponseSchema);
      await data.patchSync({
        epoch,
        logSeq: 0,
        memRev: 0,
        pendingReset: null,
        pushedAt: 0,
      });
    } catch (error) {
      // Another device started over more recently. Its data wins: the next answer tells this device to drop its own.
      if (!(error instanceof SyncError) || error.status !== NEWER_RESET) {
        throw error;
      }

      await data.patchSync({ pendingReset: null });
    }
  };

  /** Sends one page of the log with whatever else is still to send, takes in the answer, and goes on while there is more. */
  const exchange = async (outbox: Outbox): Promise<number> => {
    const { epoch, logSeq, memRev } = data.syncRecord();

    const answer = await post(
      ROUTES.sync,
      {
        epoch,
        log: outbox.log.slice(0, LOG_PAGE),
        logSeq,
        memRev,
        memory: outbox.memory,
        meta: outbox.meta,
      },
      AnswerSchema
    );

    await data.applyRemote(answer.page, {
      epoch: answer.epoch,
      logSeq: answer.logSeq,
      memRev: answer.memRev,
    });

    // After a wipe, what this device still wanted to send belongs to the generation that was dropped.
    const log = answer.page.wipe ? [] : outbox.log.slice(LOG_PAGE);
    const skipped = outbox.skipped + answer.skipped;

    if (!answer.more && log.length === 0) {
      return skipped;
    }

    return await exchange({ log, memory: [], meta: null, skipped });
  };

  /** Sends what changed here and takes in what changed elsewhere. Returns how many records were skipped. */
  const exchangeAll = async (): Promise<number> => {
    const startedAt = deps.now();
    const local = await data.localChanges(data.syncRecord().pushedAt);
    const skipped = await exchange({ ...local, skipped: 0 });

    await data.patchSync({ lastOkAt: deps.now(), pushedAt: startedAt });

    return skipped;
  };

  const run = async (): Promise<void> => {
    const { account, pendingReset } = data.syncRecord();

    if (account === null) {
      return;
    }

    setStatus({ account, busy: true, linked: true });

    try {
      if (pendingReset !== null) {
        await confirmReset(pendingReset);
      }

      const skipped = await exchangeAll();

      setStatus({
        busy: false,
        error: null,
        lastOkAt: data.syncRecord().lastOkAt,
        skipped,
      });
    } catch (error) {
      // The server no longer accepts this device's session. Progress stays on the device.
      if (error instanceof SyncError && error.status === SIGNED_OUT) {
        await forget().catch(() => null);
      }

      setStatus({
        busy: false,
        error: error instanceof Error ? error.message : "Sync failed.",
      });
    }
  };

  let running: Promise<void> | null = null;
  let again = false;

  /**
   * Runs `task` as the one thing that touches the server's side of the data.
   * Syncs asked for while it runs are folded into one sync that follows it.
   */
  const alone = async (task: () => Promise<void>): Promise<void> => {
    if (running !== null) {
      await running;
      await alone(task);

      return;
    }

    const current = task().finally(() => {
      running = null;

      if (again) {
        again = false;
        void alone(run);
      }
    });

    // Whoever asked for `task` hears of its failure; those who only wait for it to end do not.
    running = current.catch(nothing);

    await current;
  };

  const syncNow = async (): Promise<void> => {
    if (running === null) {
      await alone(run);

      return;
    }

    again = true;

    await running;
  };

  let cancelTimer = notYet;
  let stopWake = notYet;

  const syncSoon = (): void => {
    cancelTimer();
    cancelTimer = deps.host.after(QUIET_MS, () => {
      void syncNow();
    });
  };

  /** Asks the server who is signed in, and updates this device to match. Without a connection, nothing changes. */
  const checkAccount = async (): Promise<void> => {
    let account: string | null;

    try {
      account = await deps.account.currentUser();
    } catch {
      return;
    }

    if (account === data.syncRecord().account) {
      return;
    }

    await running;

    if (account === null) {
      await forget();

      return;
    }

    // Newly signed in: this device's progress and the server's are merged.
    await data.patchSync({ ...UNSYNCED, account });
    setStatus({ account, error: null, lastOkAt: null, linked: true });
  };

  /** Replaces the data here, then on the server and through it on every other device. */
  const replaceEverywhere = async (json: string | null): Promise<void> => {
    await alone(async () => {
      await data.replaceAll(json);
    });
    await syncNow();
  };

  return {
    restoreBackup: async (json) => {
      await replaceEverywhere(json);
    },

    signIn: async () => {
      try {
        await deps.account.signIn();
      } catch {
        setStatus({
          error:
            "Sign-in could not start. Check your connection and try again.",
        });
      }
    },

    signOut: async () => {
      await running;
      await deps.account.signOut().catch(() => null);
      await forget();
      setStatus({ error: null });
    },

    start: async () => {
      const { account, lastOkAt } = data.syncRecord();
      const linked = account !== null;

      // A device that signed in before does not wait for the server: it may be offline.
      setStatus({ account, checked: linked, lastOkAt, linked });
      data.onChange(syncSoon);
      stopWake = deps.host.onWake(() => {
        void syncNow();
      });
      await checkAccount();
      setStatus({ checked: true });
      void syncNow();
    },

    startOver: async () => {
      await replaceEverywhere(null);
    },

    status,

    stop: () => {
      cancelTimer();
      stopWake();
    },

    syncNow,
  };
};
