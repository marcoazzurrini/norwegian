// Keeps this device and the sync server in step. The app is only usable when signed in;
// a device that has signed in once keeps working from local data without a connection.
import { useSyncExternalStore } from 'react'
import { LOG_PAGE, type SyncRequest, type SyncResponse } from '../sync/protocol'
import { authClient } from '../lib/auth'
import type { Mem } from './memory'
import { applyRemote, importData, localChanges, onLocalChange, readSync, resetAll, writeSync, type LogEntry, type Meta } from './store'

export interface SyncStatus {
  /** True if this device is signed in, as far as it knows. */
  linked: boolean
  account: string | null
  /** False until this device knows whether it is signed in. */
  checked: boolean
  busy: boolean
  error: string | null
  lastOkAt: number | null
}

let status: SyncStatus = { linked: false, account: null, checked: false, busy: false, error: null, lastOkAt: null }
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

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new SyncError('No connection. Your progress is saved on this device and will sync later.', 0)
  }
  if (response.status === 401) throw new SyncError('You are signed out. Sign in again to sync.', 401)
  if (!response.ok) throw new SyncError(`The sync server answered with an error (${response.status}).`, response.status)
  return (await response.json()) as T
}

async function run() {
  let s = await readSync()
  if (!s.account) return
  setStatus({ linked: true, account: s.account, busy: true })
  try {
    if (s.pendingReset != null) {
      try {
        await post('/api/reset', { epoch: s.pendingReset })
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
      const res = await post<SyncResponse>('/api/sync', request)
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
    // The server no longer accepts this device's session. Progress stays on the device.
    if (e instanceof SyncError && e.status === 401) await forget()
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

/** Marks this device as signed out. Progress stays on the device and on the server. */
async function forget() {
  await writeSync({ ...(await readSync()), account: null, epoch: null, memRev: 0, logSeq: 0, pushedAt: 0, pendingReset: null, lastOkAt: null })
  setStatus({ linked: false, account: null, busy: false, lastOkAt: null })
}

/** Asks the server who is signed in, and updates this device to match. Without a connection, nothing changes. */
async function checkAccount() {
  const { data, error } = await authClient.getSession().catch(() => ({ data: null, error: true }))
  if (error) return
  const account = data?.user.email ?? null
  const s = await readSync()
  if (account === s.account) return
  await running
  if (!account) return forget()
  // Newly signed in: this device's progress and the server's are merged.
  await writeSync({ ...s, account, epoch: null, memRev: 0, logSeq: 0, pushedAt: 0, pendingReset: null, lastOkAt: null })
  setStatus({ linked: true, account, error: null, lastOkAt: null })
}

/** Call once, after the store has loaded. */
export async function startSync() {
  const s = await readSync()
  // A device that signed in before does not wait for the server: it may be offline.
  setStatus({ linked: !!s.account, account: s.account, checked: !!s.account, lastOkAt: s.lastOkAt })
  onLocalChange(syncSoon)
  window.addEventListener('online', () => void syncNow())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow()
  })
  await checkAccount()
  setStatus({ checked: true })
  void syncNow()
}

/** Sends the browser to Google. It comes back to the start page, signed in, or with ?error=... if Google or the allowlist refused. */
export async function signIn() {
  const { error } = await authClient.signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/' }).catch(() => ({ error: true }))
  if (error) setStatus({ error: 'Sign-in could not start. Check your connection and try again.' })
}

/** Signs this device out. Progress stays on the device and on the server. */
export async function signOut() {
  await running
  await authClient.signOut().catch(() => {})
  await forget()
  setStatus({ error: null })
}

/** Starts a new data generation on the server from whatever is now on this device. */
async function replaceEverywhere() {
  const s = await readSync()
  if (!s.account) return
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
