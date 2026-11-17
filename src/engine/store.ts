// Learner state: memories, review log and settings, kept in IndexedDB on this device.
import { openDB, type IDBPDatabase } from 'idb'
import { useSyncExternalStore } from 'react'
import { mergeMeta } from '../sync/merge'
import { stampOf } from '../sync/protocol'
import { createScheduler, introduce, review, type Grade, type Mem, type Scheduler } from './memory'

export interface Settings {
  minutes: number
  desiredRetention: number
  voice: string | null
  rate: number
  textScale: number
}

export interface Meta {
  settings: Settings
  /** Active study time in milliseconds. */
  totalMs: number
  /** Calendar days with at least one finished task, as YYYY-MM-DD. */
  days: string[]
  storiesDone: string[]
  /** Lesson picked on the Map, taught next if it is ready. */
  chosenLesson: number | null
  /** When each sentence was last used as a review. */
  sentenceSeen: Record<string, number>
  /** Right and total answers per sound group. */
  sounds: Record<string, { right: number; total: number }>
  /** When the session length, recall target or chosen lesson was last changed. Decides which device wins. */
  prefsAt: number
}

export interface LogEntry {
  /** Unique across devices, so the same review is never stored twice. */
  uid: string
  id: string
  grade: Grade | 'new'
  carrier: boolean
  at: number
}

export interface AppState {
  ready: boolean
  memory: ReadonlyMap<string, Mem>
  meta: Meta
}

export const DEFAULT_SETTINGS: Settings = { minutes: 15, desiredRetention: 0.9, voice: null, rate: 0.9, textScale: 1 }
const emptyMeta = (): Meta => ({
  settings: { ...DEFAULT_SETTINGS },
  totalMs: 0,
  days: [],
  storiesDone: [],
  chosenLesson: null,
  sentenceSeen: {},
  sounds: {},
  prefsAt: 0,
})

/** What this device knows about the sync server. Kept apart from Meta so it never ends up in a backup file. */
export interface SyncState {
  /** The email address signed in on this device, or null. Kept here so the app knows it while offline. */
  account: string | null
  epoch: number | null
  memRev: number
  logSeq: number
  /** Local changes made before this time have been sent. */
  pushedAt: number
  /** A "Start over" that the server has not confirmed yet. */
  pendingReset: number | null
  lastOkAt: number | null
}
const emptySync = (): SyncState => ({ account: null, epoch: null, memRev: 0, logSeq: 0, pushedAt: 0, pendingReset: null, lastOkAt: null })

let db: IDBPDatabase | null = null
let scheduler: Scheduler | null = null
let state: AppState = { ready: false, memory: new Map(), meta: emptyMeta() }
const listeners = new Set<() => void>()
let changed: () => void = () => {}
/** Registers the function to call after every change made on this device. */
export const onLocalChange = (fn: () => void) => {
  changed = fn
}

function set(next: Partial<AppState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export const getState = () => state
export const getScheduler = (): Scheduler => {
  if (!scheduler) throw new Error('The store is not loaded yet')
  return scheduler
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
    () => state,
  )
}

/** Dates arrive as text from a backup file; the scheduler needs real dates. */
function revive(m: Mem): Mem {
  const { dueAt, lastReviewAt } = m.card
  return { ...m, card: { ...m.card, dueAt: new Date(dueAt), lastReviewAt: lastReviewAt ? new Date(lastReviewAt) : null } }
}

let loading: Promise<void> | null = null
export function load(): Promise<void> {
  loading ??= (async () => {
    db = await openDB('norsk', 2, {
      async upgrade(d, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          d.createObjectStore('memory', { keyPath: 'id' })
          d.createObjectStore('log', { autoIncrement: true })
          d.createObjectStore('meta')
        }
        if (oldVersion < 2) {
          // Sync needs to find log entries by time and to tell entries from different devices apart.
          const log = tx.objectStore('log')
          log.createIndex('at', 'at')
          log.createIndex('uid', 'uid', { unique: true })
          let cursor = await log.openCursor()
          while (cursor) {
            if (!cursor.value.uid) await cursor.update({ ...cursor.value, uid: crypto.randomUUID() })
            cursor = await cursor.continue()
          }
        }
      },
    })
    const mems = ((await db.getAll('memory')) as Mem[]).map(revive)
    const saved = (await db.get('meta', 'meta')) as Partial<Meta> | undefined
    const meta = { ...emptyMeta(), ...saved, settings: { ...DEFAULT_SETTINGS, ...saved?.settings } }
    scheduler = await createScheduler(meta.settings.desiredRetention)
    set({ ready: true, memory: new Map(mems.map((m) => [m.id, m])), meta })
  })()
  return loading
}

async function saveMeta(meta: Meta) {
  set({ meta })
  await db?.put('meta', meta, 'meta')
  changed()
}

export async function updateMeta(patch: Partial<Meta>) {
  const prefsAt = 'chosenLesson' in patch ? Date.now() : state.meta.prefsAt
  await saveMeta({ ...state.meta, ...patch, prefsAt })
}

export async function updateSettings(patch: Partial<Settings>) {
  const settings = { ...state.meta.settings, ...patch }
  if (patch.desiredRetention !== undefined) scheduler = await createScheduler(settings.desiredRetention)
  // The voice, speed and text size belong to one device; only the other settings compete between devices.
  const shared = patch.minutes !== undefined || patch.desiredRetention !== undefined
  await saveMeta({ ...state.meta, settings, prefsAt: shared ? Date.now() : state.meta.prefsAt })
}

export interface ReviewInput {
  id: string
  grade: Grade
  carrier?: boolean
}

/** Records the first successful recall of new items. */
export async function teach(ids: string[], now = Date.now()) {
  const memory = new Map(state.memory)
  const tx = db?.transaction(['memory', 'log'], 'readwrite')
  for (const id of ids) {
    if (memory.has(id)) continue
    const m = introduce(getScheduler(), id, now)
    memory.set(id, m)
    tx?.objectStore('memory').put(m)
    tx?.objectStore('log').add({ uid: crypto.randomUUID(), id, grade: 'new', carrier: false, at: now } satisfies LogEntry)
  }
  set({ memory })
  await tx?.done
  changed()
}

const SAME_DAY_MS = 12 * 3_600_000

export async function applyReviews(inputs: ReviewInput[], now = Date.now()) {
  const memory = new Map(state.memory)
  const tx = db?.transaction(['memory', 'log'], 'readwrite')
  for (const { id, grade, carrier = false } of inputs) {
    const m = memory.get(id)
    if (!m) continue
    // A second pass inside a sentence on the same day adds no new evidence, so it is not counted.
    const last = m.card.lastReviewAt ? new Date(m.card.lastReviewAt).getTime() : 0
    if (carrier && grade === 'good' && m.card.scheduleStatus === 'review' && now - last < SAME_DAY_MS) continue
    const next = review(getScheduler(), m, grade, now, carrier)
    memory.set(id, next)
    tx?.objectStore('memory').put(next)
    tx?.objectStore('log').add({ uid: crypto.randomUUID(), id, grade, carrier, at: now } satisfies LogEntry)
  }
  set({ memory })
  await tx?.done
  changed()
}

/** Adds active study time and marks today as a study day. */
export async function addStudyTime(ms: number, now = Date.now()) {
  const day = new Date(now).toLocaleDateString('sv-SE')
  const days = state.meta.days.includes(day) ? state.meta.days : [...state.meta.days, day]
  await saveMeta({ ...state.meta, totalMs: state.meta.totalMs + ms, days })
}

export async function exportData(): Promise<string> {
  const log = (await db?.getAll('log')) ?? []
  return JSON.stringify({ version: 1, exportedAt: Date.now(), memory: [...state.memory.values()], meta: state.meta, log })
}

export async function importData(json: string) {
  const data = JSON.parse(json) as { version: number; memory: Mem[]; meta: Meta; log: LogEntry[] }
  if (data.version !== 1 || !Array.isArray(data.memory)) throw new Error('This file is not a Norsk backup')
  const memory = data.memory.map(revive)
  const tx = db!.transaction(['memory', 'log', 'meta'], 'readwrite')
  await Promise.all([tx.objectStore('memory').clear(), tx.objectStore('log').clear()])
  for (const m of memory) tx.objectStore('memory').put(m)
  for (const l of data.log ?? []) tx.objectStore('log').add({ ...l, uid: l.uid ?? crypto.randomUUID() })
  const meta = { ...emptyMeta(), ...data.meta, settings: { ...DEFAULT_SETTINGS, ...data.meta?.settings }, prefsAt: Date.now() }
  tx.objectStore('meta').put(meta, 'meta')
  await tx.done
  scheduler = await createScheduler(meta.settings.desiredRetention)
  set({ memory: new Map(memory.map((m) => [m.id, m])), meta })
}

export async function resetAll() {
  const tx = db!.transaction(['memory', 'log', 'meta'], 'readwrite')
  await Promise.all([tx.objectStore('memory').clear(), tx.objectStore('log').clear(), tx.objectStore('meta').delete('meta')])
  await tx.done
  scheduler = await createScheduler(DEFAULT_SETTINGS.desiredRetention)
  set({ memory: new Map(), meta: emptyMeta() })
}

// ---- Sync support (used by src/engine/sync.ts) ----

export async function readSync(): Promise<SyncState> {
  // Older versions stored a sync key here. It is no longer used, so it is dropped.
  const { key: _key, ...saved } = ((await db?.get('meta', 'sync')) ?? {}) as Partial<SyncState> & { key?: unknown }
  return { ...emptySync(), ...saved }
}

export async function writeSync(sync: SyncState) {
  await db?.put('meta', sync, 'sync')
}

/** Everything changed on this device at or after `since`. */
export async function localChanges(since: number) {
  const log = ((await db?.getAllFromIndex('log', 'at', IDBKeyRange.lowerBound(since))) ?? []) as LogEntry[]
  return { memory: [...state.memory.values()].filter((m) => stampOf(m) >= since), log, meta: state.meta }
}

/**
 * Takes in data from the server.
 * A memory replaces the local one only if it was reviewed later. `wipe` first drops all local data.
 */
export async function applyRemote(remote: { memory: Mem[]; log: LogEntry[]; meta: Meta | null; wipe: boolean }) {
  if (!db) return
  const tx = db.transaction(['memory', 'log', 'meta'], 'readwrite')
  if (remote.wipe) {
    void tx.objectStore('memory').clear()
    void tx.objectStore('log').clear()
  }
  // No waiting between reading the current state and replacing it, so a review made meanwhile is not lost.
  const memory = remote.wipe ? new Map<string, Mem>() : new Map(state.memory)
  for (const m of remote.memory.map(revive)) {
    const have = memory.get(m.id)
    if (have && stampOf(have) >= stampOf(m)) continue
    memory.set(m.id, m)
    void tx.objectStore('memory').put(m)
  }
  let meta = state.meta
  if (remote.meta) {
    const mine = state.meta.settings
    const theirs = { ...emptyMeta(), ...remote.meta }
    const merged = remote.wipe ? theirs : mergeMeta(state.meta, theirs)
    meta = { ...merged, settings: { ...DEFAULT_SETTINGS, ...merged.settings, voice: mine.voice, rate: mine.rate, textScale: mine.textScale } }
    void tx.objectStore('meta').put(meta, 'meta')
  }
  const retentionChanged = meta.settings.desiredRetention !== state.meta.settings.desiredRetention
  set({ memory, meta })

  const log = tx.objectStore('log')
  for (const entry of remote.log) if (!(await log.index('uid').getKey(entry.uid))) void log.add(entry)
  await tx.done
  if (retentionChanged) scheduler = await createScheduler(meta.settings.desiredRetention)
}
