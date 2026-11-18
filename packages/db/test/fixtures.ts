// Sync messages for the tests, in the shapes the app sends.
import { SyncedMetaSchema } from "@norsk/protocol";
import type {
  SyncedMetaInput,
  SyncRequest,
  WireLog,
  WireMem,
} from "@norsk/protocol";
import * as v from "valibot";

const HOUR = 3_600_000;

/** A memory of `id` last reviewed at `reviewedAt` (milliseconds), or never if null. */
export const mem = (
  id: string,
  reviewedAt: number | null,
  reps = 1
): WireMem => ({
  card: {
    cardId: id,
    difficulty: 5,
    dueAt: new Date((reviewedAt ?? 0) + 24 * HOUR).toJSON(),
    lapses: 0,
    lastReviewAt: reviewedAt === null ? null : new Date(reviewedAt).toJSON(),
    learningStep: 0,
    reps,
    scheduleStatus: "review",
    scheduledDays: 1,
    stability: 2.5,
    state: 2,
  },
  id,
  introducedAt: 1000,
});

export const entry = (uid: string, id = "w:hus:noun"): WireLog => ({
  at: 1000,
  carrier: false,
  grade: "good",
  id,
  uid,
});

export const meta = (patch: Partial<SyncedMetaInput> = {}) =>
  v.parse(SyncedMetaSchema, {
    settings: { desiredRetention: 0.9, minutes: 15 },
    ...patch,
  });

/** A request from a device that has never synced and has nothing, changed by `patch`. */
export const request = (patch: Partial<SyncRequest> = {}): SyncRequest => ({
  epoch: null,
  log: [],
  logSeq: 0,
  memRev: 0,
  memory: [],
  meta: null,
  ...patch,
});
