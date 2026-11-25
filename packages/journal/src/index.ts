// The journal: a record of what happened in the app, kept to find out later why it behaved as it did.
//
// Hides: where events wait on the device, how they are sent in pages, and what happens when the
// server cannot be reached. A caller notes an event and goes on; it never waits and never fails.
// Events are kept on the device until the server has stored them, so a session studied offline
// arrives later. Nothing in the app reads the journal: it is read on the server, with queries.
import {
  EVENT_PAGE,
  JournalEventSchema,
  JournalRequestSchema,
  ROUTES,
} from "@norsk/protocol";
import type { JournalEvent, JournalRequest } from "@norsk/protocol";
import { wrap } from "idb";
import type { IDBPDatabase } from "idb";
import * as v from "valibot";

const NAME = "norsk-journal";
const STORE = "events";

/**
 * The most events a device keeps while it cannot send them: about a month of daily study.
 * Beyond this the oldest are dropped, so the journal can never fill the device.
 */
export const MAX_KEPT = 20_000;

export type Fetch = (path: string, init: RequestInit) => Promise<Response>;

/** What describes one event. Anything JSON can carry. */
export type EventData = JournalEvent["data"];

export interface JournalDeps {
  /** Where the events wait on this device. */
  indexedDB: IDBFactory;
  fetch: Fetch;
  /** The current time in milliseconds. */
  now: () => number;
  /** A new id, unique across devices. */
  newId: () => string;
  /** Called with a failure to save an event. Sending failures are not reported: they are retried. */
  onError?: (error: Error) => void;
}

export interface Journal {
  /** Notes that something happened, now. `session` is the session it happened in, if any. */
  record: (kind: string, data: EventData, session?: string | null) => void;
  /**
   * Sends the events that wait to the server, oldest first, and forgets those it stored.
   * Resolves when all are sent or the server cannot be reached. Never rejects.
   */
  flush: () => Promise<void>;
  /** How many events wait on this device. For tests. */
  waiting: () => Promise<number>;
}

const open = async (factory: IDBFactory): Promise<IDBPDatabase> => {
  const request = factory.open(NAME, 1);

  request.addEventListener("upgradeneeded", () => {
    request.result.createObjectStore(STORE, { autoIncrement: true });
  });

  const db = await wrap(request);

  if (db === undefined) {
    throw new Error("The journal on this device could not be opened");
  }

  return db;
};

/** Deletes the events under these keys, in one step. */
const forget = async (
  db: IDBPDatabase,
  keys: readonly IDBValidKey[]
): Promise<void> => {
  const transaction = db.transaction(STORE, "readwrite");

  await Promise.all(
    keys.map(async (key) => {
      await transaction.store.delete(key);
    })
  );
  await transaction.done;
};

/** Drops the oldest events beyond what a device may keep. */
const trim = async (db: IDBPDatabase): Promise<void> => {
  const extra = (await db.count(STORE)) - MAX_KEPT;

  if (extra > 0) {
    await forget(db, await db.getAllKeys(STORE, undefined, extra));
  }
};

/** The oldest events that wait, at most one page, with the keys they are kept under. */
const oldest = async (db: IDBPDatabase) => {
  const transaction = db.transaction(STORE, "readonly");

  const [keys, rows] = await Promise.all([
    transaction.store.getAllKeys(undefined, EVENT_PAGE),
    transaction.store.getAll(undefined, EVENT_PAGE),
  ]);

  // A row that is not an event can never be sent. It is dropped with its page.
  const events = rows.filter((row) => v.is(JournalEventSchema, row));

  return { events, keys };
};

export const createJournal = (deps: JournalDeps): Journal => {
  let opened: Promise<IDBPDatabase> | undefined;
  // Events noted and not yet saved, oldest first. They are saved one after another, in this order.
  const noted: JournalEvent[] = [];
  let saving: Promise<void> | undefined;
  let sending: Promise<void> | undefined;

  const database = async (): Promise<IDBPDatabase> => {
    opened ??= open(deps.indexedDB);

    return await opened;
  };

  /** Saves the events that were noted. A failure is reported and that event is lost. */
  const saveNoted = async (): Promise<void> => {
    const event = noted.shift();

    if (event === undefined) {
      saving = undefined;

      return;
    }

    try {
      const db = await database();

      await db.add(STORE, event);
      await trim(db);
    } catch (error) {
      if (error instanceof Error) {
        deps.onError?.(error);
      }
    }

    await saveNoted();
  };

  const record: Journal["record"] = (kind, data, session = null) => {
    noted.push({
      at: deps.now(),
      data: { ...data },
      kind,
      session,
      uid: deps.newId(),
    });
    saving ??= saveNoted();
  };

  /** Sends one page. True if the server stored it. */
  const send = async (events: readonly JournalEvent[]): Promise<boolean> => {
    const body: JournalRequest = v.parse(JournalRequestSchema, { events });

    const response = await deps.fetch(ROUTES.journal, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    return response.ok;
  };

  /** Sends pages until none is left. Stops at the first page the server does not store. */
  const sendAll = async (db: IDBPDatabase): Promise<void> => {
    const { events, keys } = await oldest(db);

    if (keys.length === 0 || (events.length > 0 && !(await send(events)))) {
      return;
    }

    await forget(db, keys);

    if (keys.length === EVENT_PAGE) {
      await sendAll(db);
    }
  };

  const sendWaiting = async (): Promise<void> => {
    try {
      // Events noted just before are saved first.
      await saving;
      await sendAll(await database());
    } catch {
      // No connection, not signed in, or no storage: the events wait for the next time.
    } finally {
      sending = undefined;
    }
  };

  const flush = async (): Promise<void> => {
    sending ??= sendWaiting();

    await sending;
  };

  const waiting = async (): Promise<number> => {
    await saving;

    const db = await database();

    return await db.count(STORE);
  };

  return { flush, record, waiting };
};
