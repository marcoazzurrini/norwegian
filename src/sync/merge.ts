// How two copies of the learner's settings and counters are combined.
// Shared by the app and the sync server, so both always agree on the result.

export interface SyncedMeta {
  settings: { minutes: number; desiredRetention: number }
  totalMs: number
  days: string[]
  storiesDone: string[]
  chosenLesson: number | null
  sentenceSeen: Record<string, number>
  sounds: Record<string, { right: number; total: number }>
  /** When the session length, recall target or chosen lesson was last changed. */
  prefsAt: number
}

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])].sort()

/**
 * Combines two copies. The order of the arguments does not matter.
 * Choices (session length, recall target, chosen lesson) come from the copy that changed them last.
 * Everything else only ever grows, so the larger value wins.
 */
export function mergeMeta<M extends SyncedMeta>(a: M, b: M): M {
  const newer = (b.prefsAt ?? 0) > (a.prefsAt ?? 0) ? b : a
  const older = newer === a ? b : a

  const sentenceSeen = { ...older.sentenceSeen }
  for (const [id, at] of Object.entries(newer.sentenceSeen ?? {})) sentenceSeen[id] = Math.max(at, sentenceSeen[id] ?? 0)

  const sounds = { ...older.sounds }
  for (const [group, s] of Object.entries(newer.sounds ?? {})) if (!sounds[group] || s.total > sounds[group].total) sounds[group] = s

  return {
    ...older,
    ...newer,
    settings: { ...older.settings, ...newer.settings },
    totalMs: Math.max(a.totalMs ?? 0, b.totalMs ?? 0),
    days: union(a.days, b.days),
    storiesDone: union(a.storiesDone, b.storiesDone),
    sentenceSeen,
    sounds,
  }
}
