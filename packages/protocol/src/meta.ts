// The learner's settings and counters, and how two copies of them are combined.
// The app and the server both merge, so the rule is here, where both can use it.
import * as v from "valibot";

const SoundScore = v.object({ right: v.number(), total: v.number() });

/**
 * The part of the learner's settings and counters that devices share.
 * A copy written by an older version of the app may lack a field; reading fills it in.
 * Fields this version does not know are kept, so a newer device loses nothing through an older one.
 */
export const SyncedMetaSchema = v.looseObject({
  /** Lesson picked on the Map, taught next if it is ready. */
  chosenLesson: v.optional(v.nullable(v.number()), null),
  /** Calendar days with at least one finished task, as YYYY-MM-DD. */
  days: v.optional(v.array(v.string()), []),
  /** When the session length, recall target or chosen lesson was last changed. */
  prefsAt: v.optional(v.number(), 0),
  /** When each sentence was last used as a review. */
  sentenceSeen: v.optional(v.record(v.string(), v.number()), {}),
  settings: v.looseObject({
    desiredRetention: v.number(),
    minutes: v.number(),
  }),
  /** Right and total answers per sound group. */
  sounds: v.optional(v.record(v.string(), SoundScore), {}),
  storiesDone: v.optional(v.array(v.string()), []),
  /** Active study time in milliseconds. */
  totalMs: v.optional(v.number(), 0),
});

export type SyncedMeta = v.InferOutput<typeof SyncedMetaSchema>;

export type SyncedMetaInput = v.InferInput<typeof SyncedMetaSchema>;

const union = (a: readonly string[], b: readonly string[]) =>
  [...new Set([...a, ...b])].toSorted();

/** For each key, the larger of the two numbers. */
const latest = (
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>
) => {
  const merged = new Map(Object.entries(a));

  for (const [id, at] of Object.entries(b)) {
    merged.set(id, Math.max(at, merged.get(id) ?? 0));
  }

  return Object.fromEntries(merged);
};

/** For each sound group, the score with more answers. */
const fullest = (a: SyncedMeta["sounds"], b: SyncedMeta["sounds"]) => {
  const merged = new Map(Object.entries(a));

  for (const [group, score] of Object.entries(b)) {
    const have = merged.get(group);

    if (have === undefined || score.total > have.total) {
      merged.set(group, score);
    }
  }

  return Object.fromEntries(merged);
};

/**
 * Combines two copies. The order of the arguments does not matter.
 * Choices (session length, recall target, chosen lesson) come from the copy that changed them last.
 * Everything else only ever grows, so the larger value wins.
 */
export const mergeMeta = <M extends SyncedMeta>(a: M, b: M): M => {
  const newer = b.prefsAt > a.prefsAt ? b : a;
  const older = newer === a ? b : a;

  return {
    ...older,
    ...newer,
    days: union(a.days, b.days),
    sentenceSeen: latest(older.sentenceSeen, newer.sentenceSeen),
    settings: { ...older.settings, ...newer.settings },
    sounds: fullest(older.sounds, newer.sounds),
    storiesDone: union(a.storiesDone, b.storiesDone),
    totalMs: Math.max(a.totalMs, b.totalMs),
  };
};
