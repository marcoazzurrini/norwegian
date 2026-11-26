// The learner's data while the app runs: memories, settings and counters, and what each command does to them.
//
// The copy in memory leads: a command changes it at once, so the screens never wait, and then saves.
// Saves run one after another in the order the changes were made, so what is saved is always a
// state the copy in memory has been through.
import { applyReview, createScheduler, introduce, review } from "@norsk/engine";
import type { Mem, Pace, ReviewInput, Scheduler } from "@norsk/engine";
import { mergeMeta, stampOf } from "@norsk/protocol";
import type { SyncedMeta, WireMem } from "@norsk/protocol";
import { Store } from "@tanstack/store";
import * as v from "valibot";

import {
  emptyMeta,
  fromWire,
  parseBackup,
  SavedMetaSchema,
  toWire,
} from "./records";
import type { LogEntry, Meta, SyncRecord } from "./records";
import { openStorage } from "./storage";
import type { Storage } from "./storage";
import type { Progress, Settings } from "./types";

export interface DataState {
  ready: boolean;
  memory: ReadonlyMap<string, Mem>;
  scheduler: Scheduler | null;
  meta: Meta;
  progress: Progress;
}

/** What the server sent in one answer, already checked. */
export interface RemotePage {
  memory: readonly WireMem[];
  log: readonly LogEntry[];
  meta: SyncedMeta | null;
  /** This device held an older generation: drop its data and take the server's. */
  wipe: boolean;
}

export interface LocalChanges {
  memory: WireMem[];
  log: LogEntry[];
  meta: Meta;
}

export interface Data {
  store: Store<DataState>;
  load: () => Promise<void>;
  close: () => void;
  /** Registers the function to call after every change made on this device. */
  onChange: (listener: () => void) => void;

  teach: (ids: readonly string[]) => Promise<void>;
  applyReviews: (inputs: readonly ReviewInput[]) => Promise<void>;
  addStudyTime: (ms: number) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  chooseLesson: (index: number | null) => Promise<void>;
  markStoryDone: (id: string) => Promise<void>;
  markSentenceSeen: (id: string, at?: number) => Promise<void>;
  recordSound: (group: string, right: boolean) => Promise<void>;
  savePace: (pace: Pace) => Promise<void>;
  exportBackup: () => Promise<string>;

  syncRecord: () => SyncRecord;
  patchSync: (patch: Partial<SyncRecord>) => Promise<void>;
  /** Everything changed on this device at or after `since`. */
  localChanges: (since: number) => Promise<LocalChanges>;
  /** Takes in one answer of the server and moves the cursors, in one step. */
  applyRemote: (
    page: RemotePage,
    cursors: Partial<SyncRecord>
  ) => Promise<void>;
  /**
   * Replaces everything on this device with a backup file, or with nothing.
   * On a signed-in device the same step notes that the server must start a new generation.
   */
  replaceAll: (json: string | null) => Promise<void>;
}

interface DataDeps {
  course: string;
  indexedDB: IDBFactory;
  now: () => number;
  newId: () => string;
}

const progressOf = (meta: Meta): Progress => ({
  chosenLesson: meta.chosenLesson,
  days: meta.days,
  pace: meta.pace,
  sentenceSeen: meta.sentenceSeen,
  sounds: meta.sounds,
  storiesDone: meta.storiesDone,
  totalMs: meta.totalMs,
});

/** True if two settings or counters hold the same data. They are plain values, lists and records. */
const sameData = <Value>(first: Value, second: Value): boolean =>
  Object.is(first, second) || JSON.stringify(first) === JSON.stringify(second);

/** Returns `previous` if `next` holds the same data, so a screen that shows only this part is not drawn again. */
const unlessSame = <Part extends object>(previous: Part, next: Part): Part => {
  const before = new Map<string, unknown>(Object.entries(previous));
  const after = Object.entries(next);

  const same =
    after.length === before.size &&
    after.every(
      ([key, value]) => before.has(key) && sameData(before.get(key), value)
    );

  return same ? previous : next;
};

/** Brings the memories up to date with log entries whose memory was not saved. Returns the memories it made. */
const redo = (
  scheduler: Scheduler,
  memory: Map<string, Mem>,
  entries: readonly LogEntry[]
): Mem[] => {
  const redone: Mem[] = [];

  for (const entry of entries) {
    const have = memory.get(entry.id);
    let next: Mem | null = null;

    if (entry.grade === "new") {
      next =
        have === undefined ? introduce(scheduler, entry.id, entry.at) : null;
    } else if (have !== undefined) {
      // The entry exists, so the review counted when it was made: no second look at whether it came too soon.
      next = review(scheduler, have, entry.grade, entry.at);
    }

    if (next !== null) {
      memory.set(entry.id, next);
      redone.push(next);
    }
  }

  return redone;
};

const EMPTY_SYNC: SyncRecord = {
  account: null,
  epoch: null,
  lastOkAt: null,
  logSeq: 0,
  memRev: 0,
  pendingReset: null,
  pushedAt: 0,
};

const nobody = (): void => {
  // Nobody listens for changes until the sync starts.
};

export const createData = (deps: DataDeps): Data => {
  const empty = emptyMeta();

  const store = new Store<DataState>({
    memory: new Map(),
    meta: empty,
    progress: progressOf(empty),
    ready: false,
    scheduler: null,
  });

  let storage: Storage | null = null;
  let record = EMPTY_SYNC;
  let changed = nobody;

  // The end of the line of saves. Each save starts when the one before it has ended, however it ended.
  let saves: Promise<unknown> = Promise.resolve();

  const save = async <Result>(
    task: (storage: Storage) => Promise<Result>
  ): Promise<Result> => {
    const opened = storage;

    if (opened === null) {
      throw new Error("The learner's data is not loaded yet");
    }

    const done = saves.then(async () => await task(opened));
    saves = done.catch(() => null);

    return await done;
  };

  const live = (): DataState & { scheduler: Scheduler } => {
    const { scheduler, ...state } = store.state;

    if (!state.ready || scheduler === null) {
      throw new Error("The learner's data is not loaded yet");
    }

    return { ...state, scheduler };
  };

  const set = (patch: Partial<DataState>): void => {
    store.setState((state) => ({ ...state, ...patch }));
  };

  /** Puts new settings and counters in memory. Parts that hold the same values keep their identity. */
  const setMeta = (next: Meta): Meta => {
    const { meta: before, progress } = store.state;
    const settings = unlessSame(before.settings, next.settings);
    const meta = { ...next, settings };

    set({ meta, progress: unlessSame(progress, progressOf(meta)) });

    return meta;
  };

  const saveMeta = async (change: (meta: Meta) => Meta): Promise<void> => {
    const meta = setMeta(change(live().meta));

    await save(async (opened) => {
      await opened.putMeta(meta);
    });
    changed();
  };

  /** The log entry is saved first and the memory second; `load` finishes the job if the app stops in between. */
  const saveReviews = async (
    memory: ReadonlyMap<string, Mem>,
    mems: readonly Mem[],
    entries: readonly LogEntry[]
  ): Promise<void> => {
    if (entries.length > 0) {
      set({ memory });

      await save(async (opened) => {
        await opened.appendLog(entries);
        await opened.putMemories(mems);
      });
    }

    changed();
  };

  return {
    addStudyTime: async (ms) => {
      const day = new Date(deps.now()).toLocaleDateString("sv-SE");

      await saveMeta((meta) => ({
        ...meta,
        days: meta.days.includes(day) ? meta.days : [...meta.days, day],
        totalMs: meta.totalMs + ms,
      }));
    },

    applyRemote: async (page, cursors) => {
      const before = store.state;
      const merged = new Map(page.wipe ? [] : before.memory);
      const taken: Mem[] = [];

      for (const mem of page.memory.map(fromWire)) {
        const have = merged.get(mem.id);

        // A memory replaces the one here only if it was reviewed later.
        if (have === undefined || stampOf(have) < stampOf(mem)) {
          merged.set(mem.id, mem);
          taken.push(mem);
        }
      }

      // An answer that brings no memory leaves the map as it is, so the screens that show it are not drawn again.
      const memory = page.wipe || taken.length > 0 ? merged : before.memory;

      let meta: Meta | undefined;

      if (page.meta !== null) {
        const mine = before.meta.settings;
        const theirs = v.parse(SavedMetaSchema, page.meta);
        const both = page.wipe ? theirs : mergeMeta(before.meta, theirs);

        // The voice, speed and text size belong to this device and never come from another.
        // So does the pace: a phone and a keyboard are not typed on at the same speed.
        meta = setMeta({
          ...both,
          pace: before.meta.pace,
          settings: {
            ...both.settings,
            rate: mine.rate,
            textScale: mine.textScale,
            voice: mine.voice,
          },
        });
      }

      // No waiting between reading the current state and replacing it, so a review made meanwhile is not lost.
      set({ memory });
      record = { ...record, ...cursors };
      const sync = record;

      await save(async (opened) => {
        await opened.applyPage({
          log: page.log,
          memory: taken,
          meta,
          sync,
          wipe: page.wipe,
        });
      });

      const retention = store.state.meta.settings.desiredRetention;

      if (retention !== before.meta.settings.desiredRetention) {
        set({ scheduler: await createScheduler(retention) });
      }
    },

    applyReviews: async (inputs) => {
      const { memory: before, scheduler } = live();
      const now = deps.now();
      const memory = new Map(before);
      const mems: Mem[] = [];
      const entries: LogEntry[] = [];

      for (const input of inputs) {
        const have = memory.get(input.id);

        const next =
          have === undefined ? null : applyReview(scheduler, have, input, now);

        if (next !== null) {
          memory.set(input.id, next);
          mems.push(next);
          entries.push({
            at: now,
            carrier: input.carrier === true,
            grade: input.grade,
            id: input.id,
            uid: deps.newId(),
          });
        }
      }

      await saveReviews(memory, mems, entries);
    },

    chooseLesson: async (index) => {
      await saveMeta((meta) => ({
        ...meta,
        chosenLesson: index,
        prefsAt: deps.now(),
      }));
    },

    close: () => {
      storage?.close();
    },

    exportBackup: async () => {
      live();
      const log = await save(async (opened) => await opened.allLog());
      const { memory, meta } = store.state;

      return JSON.stringify({
        course: deps.course,
        exportedAt: deps.now(),
        log,
        memory: [...memory.values()],
        meta,
        version: 1,
      });
    },

    load: async () => {
      const opened = await openStorage(deps.indexedDB, deps.course, deps.newId);

      const saved = await opened.read();

      const scheduler = await createScheduler(
        saved.meta.settings.desiredRetention
      );

      const memory = new Map(saved.memory.map((mem) => [mem.id, mem]));
      const redone = redo(scheduler, memory, saved.unapplied);

      if (redone.length > 0) {
        await opened.putMemories(redone);
      }

      storage = opened;
      record = saved.sync;
      set({
        memory,
        meta: saved.meta,
        progress: progressOf(saved.meta),
        ready: true,
        scheduler,
      });
    },

    localChanges: async (since) => {
      const log = await save(async (opened) => await opened.logSince(since));
      const { memory, meta } = store.state;

      return {
        log,
        memory: [...memory.values()].flatMap((mem) => {
          const wire = stampOf(mem) < since ? null : toWire(mem);

          // A memory the server would refuse stays here; sending it would fail the whole message.
          return wire === null ? [] : [wire];
        }),
        meta,
      };
    },

    markSentenceSeen: async (id, at = deps.now()) => {
      await saveMeta((meta) => ({
        ...meta,
        sentenceSeen: { ...meta.sentenceSeen, [id]: at },
      }));
    },

    savePace: async (pace) => {
      await saveMeta((meta) => ({ ...meta, pace }));
    },

    markStoryDone: async (id) => {
      await saveMeta((meta) => ({
        ...meta,
        storiesDone: meta.storiesDone.includes(id)
          ? meta.storiesDone
          : [...meta.storiesDone, id],
      }));
    },

    onChange: (listener) => {
      changed = listener;
    },

    patchSync: async (patch) => {
      record = { ...record, ...patch };
      const sync = record;

      await save(async (opened) => {
        await opened.putSync(sync);
      });
    },

    recordSound: async (group, right) => {
      await saveMeta((meta) => {
        const score = meta.sounds[group] ?? { right: 0, total: 0 };

        return {
          ...meta,
          sounds: {
            ...meta.sounds,
            [group]: {
              right: score.right + (right ? 1 : 0),
              total: score.total + 1,
            },
          },
        };
      });
    },

    replaceAll: async (json) => {
      live();

      const backup =
        json === null ? null : parseBackup(json, deps.course, deps.newId);

      const now = deps.now();

      // A restored backup counts as the latest choice of settings on any device.
      const meta =
        backup === null ? emptyMeta() : { ...backup.meta, prefsAt: now };

      const scheduler = await createScheduler(meta.settings.desiredRetention);
      const mems = backup?.memory ?? [];
      const before = { record, state: store.state };

      set({ memory: new Map(mems.map((mem) => [mem.id, mem])), scheduler });
      setMeta(meta);

      // Only a signed-in device has a server to tell. Everything here is then sent again as the new generation.
      if (record.account !== null) {
        record = { ...record, pendingReset: now, pushedAt: 0 };
      }

      const sync = record;

      try {
        await save(async (opened) => {
          await opened.replaceAll({
            log: backup?.log ?? [],
            memory: mems,
            meta: backup === null ? null : meta,
            sync,
          });
        });
      } catch (error) {
        // Nothing was replaced on the device, so nothing must be replaced on the server either.
        ({ record } = before);
        store.setState(() => before.state);

        throw error;
      }
    },

    store,
    syncRecord: () => record,

    teach: async (ids) => {
      const { memory: before, scheduler } = live();
      const now = deps.now();
      const memory = new Map(before);
      const mems: Mem[] = [];
      const entries: LogEntry[] = [];

      for (const id of ids) {
        if (!memory.has(id)) {
          const mem = introduce(scheduler, id, now);
          memory.set(id, mem);
          mems.push(mem);
          entries.push({
            at: now,
            carrier: false,
            grade: "new",
            id,
            uid: deps.newId(),
          });
        }
      }

      await saveReviews(memory, mems, entries);
    },

    updateSettings: async (patch) => {
      live();

      // Changing the recall target rebuilds the scheduler.
      if (patch.desiredRetention !== undefined) {
        set({ scheduler: await createScheduler(patch.desiredRetention) });
      }

      // The voice, speed and text size belong to one device; only the other settings compete between devices.
      const shared =
        patch.minutes !== undefined || patch.desiredRetention !== undefined;

      await saveMeta((meta) => ({
        ...meta,
        prefsAt: shared ? deps.now() : meta.prefsAt,
        settings: { ...meta.settings, ...patch },
      }));
    },
  };
};
