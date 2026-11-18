// The shapes of the learner's data as this device saves it and as a backup file holds it,
// and the conversions to and from the shapes that travel to the server.
import type { Mem } from "@norsk/engine";
import {
  SyncedMetaSchema,
  WireCardSchema,
  WireLogSchema,
  WireMemSchema,
} from "@norsk/protocol";
import type { WireLog, WireMem } from "@norsk/protocol";
import * as v from "valibot";

import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  desiredRetention: 0.9,
  minutes: 15,
  rate: 0.9,
  textScale: 1,
  voice: null,
};

const SoundScoreSchema = v.object({ right: v.number(), total: v.number() });

const SettingsSchema = v.looseObject({
  desiredRetention: v.optional(v.number(), DEFAULT_SETTINGS.desiredRetention),
  minutes: v.optional(v.number(), DEFAULT_SETTINGS.minutes),
  rate: v.optional(v.number(), DEFAULT_SETTINGS.rate),
  textScale: v.optional(v.number(), DEFAULT_SETTINGS.textScale),
  voice: v.optional(v.nullable(v.string()), DEFAULT_SETTINGS.voice),
});

/**
 * Settings and counters as a backup file holds them. A missing field gets its default;
 * a field with the wrong kind of value makes the whole file invalid.
 */
const MetaSchema = v.looseObject({
  ...SyncedMetaSchema.entries,
  settings: v.optional(SettingsSchema, {}),
});

/** Settings and counters. Fields this version does not know are kept. */
export type Meta = v.InferOutput<typeof MetaSchema>;

const SavedSettingsSchema = v.looseObject({
  desiredRetention: v.fallback(v.number(), DEFAULT_SETTINGS.desiredRetention),
  minutes: v.fallback(v.number(), DEFAULT_SETTINGS.minutes),
  rate: v.fallback(v.number(), DEFAULT_SETTINGS.rate),
  textScale: v.fallback(v.number(), DEFAULT_SETTINGS.textScale),
  voice: v.fallback(v.nullable(v.string()), DEFAULT_SETTINGS.voice),
});

// Each fallback is a function, so two copies never share one array or object.
const SavedMetaFieldsSchema = v.looseObject({
  chosenLesson: v.fallback(v.nullable(v.number()), null),
  days: v.fallback(v.array(v.string()), () => []),
  prefsAt: v.fallback(v.number(), 0),
  sentenceSeen: v.fallback(v.record(v.string(), v.number()), () => ({})),
  settings: v.fallback(SavedSettingsSchema, () => ({ ...DEFAULT_SETTINGS })),
  sounds: v.fallback(v.record(v.string(), SoundScoreSchema), () => ({})),
  storiesDone: v.fallback(v.array(v.string()), () => []),
  totalMs: v.fallback(v.number(), 0),
});

/**
 * Settings and counters that this app saved, or that the server sent after its own check.
 * Reading never fails: a field that is missing or unreadable gets its default and the others
 * are kept, so one bad value cannot stop the app from starting.
 */
export const SavedMetaSchema = v.fallback(SavedMetaFieldsSchema, () =>
  v.parse(SavedMetaFieldsSchema, {})
);

export const emptyMeta = (): Meta => v.parse(SavedMetaSchema, {});

/** A point in time as it is saved (a date) or as a backup file holds it (text). */
const InstantSchema = v.pipe(
  v.union([v.date(), v.string()]),
  v.transform((value) => new Date(value)),
  v.date()
);

const CardSchema = v.looseObject({
  ...WireCardSchema.entries,
  dueAt: InstantSchema,
  lastReviewAt: v.nullable(InstantSchema),
});

/** A memory as this device saves it or as a backup file holds it. Reading gives real dates. */
export const MemSchema = v.object({
  card: CardSchema,
  id: WireMemSchema.entries.id,
  introducedAt: v.number(),
});

/** One review, or the first learning of an item. */
export type LogEntry = WireLog;

const EntrySchema = v.object({
  ...WireLogSchema.entries,
  // The first version of the app did not save this field.
  carrier: v.optional(v.boolean(), false),
});

/**
 * A log entry as this device saves it. `local` marks an entry made on this device;
 * entries from the server and from before this field existed do not have it.
 */
export const SavedLogSchema = v.object({
  ...EntrySchema.entries,
  local: v.optional(v.literal(true)),
});

/** Rows of the saved log. A row that cannot be read becomes null. */
export const SavedEntriesSchema = v.array(
  v.fallback(v.nullable(EntrySchema), null)
);

const BackupLogSchema = v.object({
  ...EntrySchema.entries,
  // Backups from the first version of the app have no ids on their entries.
  uid: v.optional(WireLogSchema.entries.uid),
});

/** Backup files written by this app and by every earlier version of it. */
const BackupSchema = v.object({
  log: v.nullish(v.array(BackupLogSchema), []),
  memory: v.array(MemSchema),
  meta: v.nullish(MetaSchema, {}),
  version: v.literal(1),
});

export interface Backup {
  log: LogEntry[];
  memory: Mem[];
  meta: Meta;
}

const NOT_A_BACKUP = "This file is not a Norsk backup";

/** Reads the text of a backup file. Throws if anything in it is not what a backup holds. */
export const parseBackup = (json: string, newId: () => string): Backup => {
  let data: unknown;

  try {
    data = JSON.parse(json);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }

  const parsed = v.safeParse(BackupSchema, data);

  if (!parsed.success) {
    throw new Error(NOT_A_BACKUP);
  }

  const log = parsed.output.log.map((entry) => ({
    ...entry,
    uid: entry.uid ?? newId(),
  }));

  // The same review twice would be refused when it is saved, after the old data is gone.
  if (new Set(log.map((entry) => entry.uid)).size !== log.length) {
    throw new Error(NOT_A_BACKUP);
  }

  return { log, memory: parsed.output.memory, meta: parsed.output.meta };
};

const SyncRecordSchema = v.object({
  /** The email address signed in on this device, or null. Kept here so the app knows it while offline. */
  account: v.fallback(v.nullable(v.string()), null),
  /** The data generation this device belongs to. */
  epoch: v.fallback(v.nullable(v.number()), null),
  lastOkAt: v.fallback(v.nullable(v.number()), null),
  /** Cursor: the last log entry received from the server. */
  logSeq: v.fallback(v.number(), 0),
  /** Cursor: the last memory revision received from the server. */
  memRev: v.fallback(v.number(), 0),
  /** A "Start over" or "Restore backup" that the server has not confirmed yet. */
  pendingReset: v.fallback(v.nullable(v.number()), null),
  /** Local changes made before this time have been sent. */
  pushedAt: v.fallback(v.number(), 0),
});

/** What this device knows about the sync server. Kept apart from the settings so it never ends up in a backup file. */
export type SyncRecord = v.InferOutput<typeof SyncRecordSchema>;

/** Reading never fails, for the same reason as `SavedMetaSchema`. Fields of older versions (a sync key) are dropped. */
export const SavedSyncSchema = v.fallback(SyncRecordSchema, () =>
  v.parse(SyncRecordSchema, {})
);

/** The memory as it travels, or null if the server would refuse it. */
export const toWire = (mem: Mem): WireMem | null => {
  const { dueAt, lastReviewAt } = mem.card;

  // toJSON gives null for a broken date where toISOString would throw.
  const sent = v.safeParse(WireMemSchema, {
    card: {
      ...mem.card,
      dueAt: dueAt.toJSON(),
      lastReviewAt: lastReviewAt === null ? null : lastReviewAt.toJSON(),
    },
    id: mem.id,
    introducedAt: mem.introducedAt,
  });

  return sent.success ? sent.output : null;
};

export const fromWire = (wire: WireMem): Mem => ({
  card: {
    ...wire.card,
    dueAt: new Date(wire.card.dueAt),
    lastReviewAt:
      wire.card.lastReviewAt === null ? null : new Date(wire.card.lastReviewAt),
  },
  id: wire.id,
  introducedAt: wire.introducedAt,
});
