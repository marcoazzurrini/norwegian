// The journal: a record of what happened in the app, kept to find out later why it behaved as it did.
// Events only travel from a device to the server. Nothing in the app reads them back.
import * as v from "valibot";

/** How many events travel in one message. */
export const EVENT_PAGE = 500;

/**
 * One thing that happened: a session started, a task was chosen, an answer was typed.
 * `data` is whatever describes that kind of event; the server stores it without reading it.
 */
export const JournalEventSchema = v.object({
  /** When it happened on the device, in milliseconds. */
  at: v.number(),
  data: v.record(v.string(), v.unknown()),
  /** What happened, for example "task.chosen". */
  kind: v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
  /** The session it happened in, or null outside a session. */
  session: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  /** Unique across devices, so an event sent twice is stored once. */
  uid: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
});

export type JournalEvent = v.InferOutput<typeof JournalEventSchema>;

export const JournalRequestSchema = v.object({
  events: v.pipe(v.array(JournalEventSchema), v.maxLength(EVENT_PAGE)),
});

export type JournalRequest = v.InferOutput<typeof JournalRequestSchema>;

/** How many of the events sent are now stored, counting those that already were. */
export const JournalResponseSchema = v.object({ stored: v.number() });

export type JournalResponse = v.InferOutput<typeof JournalResponseSchema>;
