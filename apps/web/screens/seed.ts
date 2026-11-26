import { createScheduler, introduce, review } from "@norsk/engine";
import type { Mem } from "@norsk/engine";
import type { Progress, Settings } from "@norsk/learner";
// The learner data that the pictures start from. Each profile is built with the real engine,
// from a fixed moment, so it is the same on every run.
import { course } from "@norsk/norwegian";

import { NOW } from "./learner-data";
import type { Seed } from "./learner-data";

const { lessons } = course;

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type Profile =
  | "empty"
  | "progress"
  | "reviews"
  | "afterGreetings"
  | "beforeHome"
  | "beforeThe";

const scheduler = await createScheduler(0.9);

/** An item taught some days ago and reviewed on time since, up to `stopDays` days before now. */
const practised = (id: string, daysAgo: number, stopDays: number): Mem => {
  const reviewUntil = NOW - stopDays * DAY;

  const next = (mem: Mem): Mem => {
    const due = new Date(mem.card.dueAt).getTime();

    return due > reviewUntil ? mem : next(review(scheduler, mem, "good", due));
  };

  return next(introduce(scheduler, id, NOW - daysAgo * DAY));
};

const itemsOf = (index: number): string[] => lessons[index]?.items ?? [];

/** Every item of the first lessons, learned long ago and not due. */
const learned = (lessonCount: number): Mem[] =>
  lessons
    .slice(0, lessonCount)
    .flatMap((lesson) => lesson.items.map((id) => practised(id, 30, 0)));

/** The row of settings and counters, as the learner keeps it on the device. */
interface Meta extends Progress {
  settings: Settings;
  /** When the session length, recall target or chosen lesson was last changed. */
  prefsAt: number;
}

const settings = (textScale: number): Settings => ({
  desiredRetention: 0.9,
  minutes: 15,
  rate: 0.9,
  textScale,
  voice: null,
});

const meta = (textScale: number, patch: Partial<Meta> = {}): Meta => ({
  chosenLesson: null,
  days: [],
  pace: {},
  prefsAt: 0,
  sentenceSeen: {},
  settings: settings(textScale),
  sounds: {},
  storiesDone: [],
  totalMs: 0,
  ...patch,
});

/** A device that signed in before. A production build shows nothing else until the learner is signed in. */
export const signedIn = {
  account: "kari.nordmann@example.com",
  epoch: 1,
  lastOkAt: null,
  logSeq: 0,
  memRev: 0,
  pendingReset: null,
  pushedAt: 0,
};

/** Eighteen study days that end the day before the pictures are taken. */
const studyDays = Array.from({ length: 18 }, (_, index) =>
  new Date(NOW - (index + 1) * DAY).toLocaleDateString("sv-SE", {
    timeZone: "Europe/Oslo",
  })
).toReversed();

/**
 * Ten lessons learned over the last weeks. In the older lessons every third item was last
 * reviewed a month ago, so its next review has arrived. The later lessons are recent, so
 * their items are not stable yet.
 */
const reviews = (): Mem[] =>
  lessons
    .slice(0, 10)
    .flatMap((lesson) =>
      lesson.items.map((id, at) =>
        practised(
          id,
          60 - lesson.index * 6,
          at % 3 === 0 && lesson.index < 5 ? 30 : 0
        )
      )
    );

/** The first three items of the eleventh lesson, taught two hours ago and due again. */
const fresh = (): Mem[] =>
  itemsOf(10)
    .slice(0, 3)
    .map((id) => introduce(scheduler, id, NOW - 2 * HOUR));

const history = {
  days: studyDays,
  sounds: {
    "u-o": { right: 3, total: 4 },
    "y-i": { right: 7, total: 10 },
  },
  storiesDone: ["st1-0"],
  totalMs: 12.4 * HOUR,
};

export const seedFor = (profile: Profile, textScale = 1): Seed => {
  switch (profile) {
    case "empty": {
      return {
        memory: [],
        meta: textScale === 1 ? null : meta(textScale),
        sync: null,
      };
    }

    // Some weeks in: cards for the newest items come first in a session, then sentences.
    case "progress": {
      return {
        memory: [...reviews(), ...fresh()],
        meta: meta(textScale, history),
        sync: signedIn,
      };
    }

    // The same learner with nothing in its first minutes: a session starts with sentences.
    case "reviews": {
      return {
        memory: reviews(),
        meta: meta(textScale, history),
        sync: signedIn,
      };
    }

    // The next thing to learn is the pattern "Verbs now", which has no practice sentences yet.
    case "afterGreetings": {
      return {
        memory: learned(1),
        meta: meta(textScale, { days: studyDays.slice(-3), totalMs: HOUR }),
        sync: signedIn,
      };
    }

    // The next things to learn are three nouns, each with an article, a sound and an example.
    case "beforeHome": {
      return {
        memory: learned(8),
        meta: meta(textScale, { days: studyDays, totalMs: 8 * HOUR }),
        sync: signedIn,
      };
    }

    // The next thing to learn is the pattern 'Saying "the"', with contrasting examples and practice.
    case "beforeThe": {
      return {
        memory: learned(9),
        meta: meta(textScale, { days: studyDays, totalMs: 9 * HOUR }),
        sync: signedIn,
      };
    }

    default: {
      throw new Error(`Unknown profile "${String(profile)}"`);
    }
  }
};
