// The messages the app and the sync server exchange. See worker/index.ts for the server side.

/** A stored memory as it travels: dates are text. */
export interface WireMem {
  id: string;
  introducedAt: number;
  card: { lastReviewAt: string | Date | null };
}

export interface WireLog {
  uid: string;
  id: string;
  grade: string;
  carrier: boolean;
  at: number;
}

export interface SyncRequest {
  /** The data generation this device belongs to. Null on a device that has never synced. */
  epoch: number | null;
  /** Cursors: the server sends everything after these. */
  memRev: number;
  logSeq: number;
  memory: WireMem[];
  log: WireLog[];
  meta: unknown | null;
}

export interface SyncResponse {
  epoch: number;
  /** True if this device held an older generation: it must drop its data and take the server's. */
  reset: boolean;
  memRev: number;
  logSeq: number;
  /** True if more log entries are waiting; ask again. */
  more: boolean;
  memory: WireMem[];
  log: WireLog[];
  meta: unknown | null;
}

/** When a memory last changed. The copy with the later time wins. */
export const stampOf = (m: WireMem): number =>
  m.card.lastReviewAt
    ? new Date(m.card.lastReviewAt).getTime()
    : m.introducedAt;

export const LOG_PAGE = 2000;
