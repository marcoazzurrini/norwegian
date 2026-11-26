// The messages of the sync exchange. A device sends what changed on it and two cursors;
// the server stores the changes and answers with everything after those cursors.
import * as v from "valibot";

import { MessageCourseSchema } from "./course";
import { SyncedMetaSchema } from "./meta";

/** How many log entries travel in one message. */
export const LOG_PAGE = 2000;

/** No item id is longer than this. */
const MAX_ID = 200;

/** A device never has more memories than there are items; this is far above that. */
const MAX_MEMORIES = 20_000;

/** A point in time as JSON carries it, for example "2026-11-18T10:00:00.000Z". */
const Instant = v.pipe(v.string(), v.isoTimestamp());

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));

/**
 * The scheduling state of one item (an FSRS card), with its dates as text.
 * Fields this version does not know are kept.
 */
export const WireCardSchema = v.looseObject({
  cardId: v.union([v.string(), v.number()]),
  difficulty: v.number(),
  dueAt: Instant,
  lapses: Count,
  lastReviewAt: v.nullable(Instant),
  learningStep: Count,
  reps: Count,
  scheduleStatus: v.picklist(["new", "learning", "review"]),
  scheduledDays: v.number(),
  stability: v.number(),
  state: v.picklist([0, 1, 2, 3]),
});

export type WireCard = v.InferOutput<typeof WireCardSchema>;

/** What the learner remembers of one item. Fields this version does not know are kept. */
export const WireMemSchema = v.looseObject({
  card: WireCardSchema,
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID)),
  /** When the item was first learned, in milliseconds. */
  introducedAt: v.number(),
});

export type WireMem = v.InferOutput<typeof WireMemSchema>;

/** One review, or the first learning of an item ("new"). Fields this version does not know are kept. */
export const WireLogSchema = v.looseObject({
  at: v.number(),
  /** True if the item was recalled inside a sentence. */
  carrier: v.boolean(),
  grade: v.picklist(["again", "good", "new"]),
  id: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_ID)),
  /** Unique across devices, so the same review is never stored twice. */
  uid: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
});

export type WireLog = v.InferOutput<typeof WireLogSchema>;

export const SyncRequestSchema = v.object({
  /** The course whose data is exchanged. Each course has its own memories, log, settings and cursors. */
  course: MessageCourseSchema,
  /** The data generation this device belongs to. Null on a device that has never synced. */
  epoch: v.nullable(Count),
  log: v.pipe(v.array(WireLogSchema), v.maxLength(LOG_PAGE)),
  /** Cursor: the server sends every log entry after this one. */
  logSeq: Count,
  /** Cursor: the server sends every memory changed after this revision. */
  memRev: Count,
  memory: v.pipe(v.array(WireMemSchema), v.maxLength(MAX_MEMORIES)),
  meta: v.nullable(SyncedMetaSchema),
});

export type SyncRequest = v.InferOutput<typeof SyncRequestSchema>;

export const SyncResponseSchema = v.object({
  epoch: Count,
  log: v.array(WireLogSchema),
  logSeq: Count,
  memRev: Count,
  memory: v.array(WireMemSchema),
  meta: v.nullable(SyncedMetaSchema),
  /** True if more log entries are waiting; ask again. */
  more: v.boolean(),
  /** True if this device held an older generation: it must drop its data and take the server's. */
  reset: v.boolean(),
});

export type SyncResponse = v.InferOutput<typeof SyncResponseSchema>;

/**
 * "Start over" in one course: begins a new data generation there and leaves the other courses alone.
 * The number is the time the learner asked for it.
 */
export const ResetRequestSchema = v.object({
  course: MessageCourseSchema,
  epoch: Count,
});

export type ResetRequest = v.InferOutput<typeof ResetRequestSchema>;

export const ResetResponseSchema = v.object({ epoch: Count });

export type ResetResponse = v.InferOutput<typeof ResetResponseSchema>;

/** When a memory last changed, in milliseconds. Of two copies, the one with the later time wins. */
export const stampOf = (mem: {
  card: { lastReviewAt: string | Date | null };
  introducedAt: number;
}): number =>
  mem.card.lastReviewAt === null
    ? mem.introducedAt
    : new Date(mem.card.lastReviewAt).getTime();
