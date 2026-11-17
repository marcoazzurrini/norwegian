// Keeps this device and the sync server in step. Without a sync key, nothing here runs
// and the app works from local data alone.
import { useSyncExternalStore } from 'react'
import { LOG_PAGE, type SyncRequest, type SyncResponse } from '../sync/protocol'
import type { Mem } from './memory'
import { applyRemote, importData, localChanges, onLocalChange, readSync, resetAll, writeSync, type LogEntry, type Meta } from './store'

export interface SyncStatus {
  linked: boolean
  busy: boolean
  error: string | null
  lastOkAt: number | null
}

let status: SyncStatus = { linked: false, busy: false, error: null, lastOkAt: null }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  for (const l of listeners) l()
}

export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => status,
    () => status,
  )
}

class SyncError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function post<T>(path: string, key: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(body) })
  } catch {
    throw new SyncError('No connection. Your progress is saved on this device and will sync later.', 0)
  }
  if (response.status === 401) throw new SyncError('The sync key is wrong.', 401)
  if (!response.ok) throw new SyncError(`The sync server answered with an error (${response.status}).`, response.status)
  return (await response.json()) as T
}

async function run() {
  let s = await readSync()
  if (!s.key) return
  const key = s.key
  setStatus({ linked: true, busy: true })
  try {
    if (s.pendingReset != null) {
      try {
        await post('/api/reset', key, { epoch: s.pendingReset })
        s = { ...s, epoch: s.pendingReset, memRev: 0, logSeq: 0, pushedAt: 0 }
      } catch (e) {
        // 409: another device started over more recently. Its data wins.
        if (!(e instanceof SyncError) || e.status !== 409) throw e
      }
      s = { ...s, pendingReset: null }
      await writeSync(s)
    }

    const startedAt = Date.now()
    const local = await localChanges(s.pushedAt)
    let memory: SyncRequest['memory'] = local.memory
    let meta: Meta | null = local.meta
    let queue: LogEntry[] = local.log
    let more = true
    while (more) {
      const request: SyncRequest = { epoch: s.epoch, memRev: s.memRev, logSeq: s.logSeq, memory, meta, log: queue.slice(0, LOG_PAGE) }
      const res = await post<SyncResponse>('/api/sync', key, request)
      queue = res.reset ? [] : queue.slice(LOG_PAGE)
      memory = []
      meta = null
      await applyRemote({ memory: res.memory as unknown as Mem[], log: res.log as LogEntry[], meta: res.meta as Meta | null, wipe: res.reset })
      s = { ...s, epoch: res.epoch, memRev: res.memRev, logSeq: res.logSeq }
      await writeSync(s)
      more = res.more || queue.length > 0
    }
    s = { ...s, pushedAt: startedAt, lastOkAt: Date.now() }
    await writeSync(s)
    setStatus({ busy: false, error: null, lastOkAt: s.lastOkAt })
  } catch (e) {
    setStatus({ busy: false, error: e instanceof Error ? e.message : 'Sync failed.' })
  }
}

let running: Promise<void> | null = null
let again = false

/** Sends local changes and fetches remote ones. Calls made while a sync runs are folded into one follow-up. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = run().finally(() => {
    running = null
    if (again) {
      again = false
      void syncNow()
    }
  })
  return running
}

let timer: ReturnType<typeof setTimeout> | undefined
function syncSoon() {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), 2500)
}

/** Call once, after the store has loaded. */
export async function startSync() {
  const s = await readSync()
  setStatus({ linked: !!s.key, lastOkAt: s.lastOkAt })
  onLocalChange(syncSoon)
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  void syncNow()
}

/** Links this device. Its progress and the server's are merged. */
export async function connect(key: string) {
  await running
  await writeSync({ ...(await readSync()), key: key.trim(), epoch: null, memRev: 0, logSeq: 0, pushedAt: 0, pendingReset: null, lastOkAt: null })
  setStatus({ linked: true, error: null, lastOkAt: null })
  await syncNow()
}

/** Unlinks this device. Progress stays on the device and on the server. */
export async function disconnect() {
  await running
  await writeSync({ ...(await readSync()), key: null, epoch: null, memRev: 0, logSeq: 0, pushedAt: 0, pendingReset: null, lastOkAt: null })
  setStatus({ linked: false, busy: false, error: null, lastOkAt: null })
}

/** Starts a new data generation on the server from whatever is now on this device. */
async function replaceEverywhere() {
  const s = await readSync()
  if (!s.key) return
  await writeSync({ ...s, pendingReset: Date.now(), pushedAt: 0 })
  await syncNow()
}

/** Deletes all progress, here and on every linked device. */
export async function startOver() {
  await running
  await resetAll()
  await replaceEverywhere()
}

/** Replaces all progress with a backup file, here and on every linked device. */
export async function restoreBackup(json: string) {
  await running
  await importData(json)
  await replaceEverywhere()
}
