// A simulated device. It keeps data and talks to the server the way the app in production does
// (apps/web/src/engine/sync.ts and store.ts at the time of this refactor), using only raw requests.
import {
  LOG_PAGE,
  mergeMeta,
  stampOf,
  SyncedMetaSchema,
  SyncResponseSchema,
} from "@norsk/protocol";
import type { SyncResponse } from "@norsk/protocol";
import * as v from "valibot";

import { postText } from "./helpers";

interface Card {
  cardId: string;
  difficulty: number;
  dueAt: Date;
  lapses: number;
  lastReviewAt: Date | null;
  learningStep: number;
  reps: number;
  scheduleStatus: "new" | "learning" | "review";
  scheduledDays: number;
  stability: number;
  state: 0 | 1 | 2 | 3;
}

interface Mem {
  card: Card;
  id: string;
  introducedAt: number;
}

interface LogEntry {
  at: number;
  carrier: boolean;
  grade: "again" | "good" | "new";
  id: string;
  uid: string;
}

/** The whole local settings object. The app sends all of it, also what belongs to one device. */
interface Meta {
  chosenLesson: number | null;
  days: string[];
  prefsAt: number;
  sentenceSeen: Record<string, number>;
  settings: {
    desiredRetention: number;
    minutes: number;
    rate: number;
    textScale: number;
    voice: string | null;
  };
  sounds: Record<string, { right: number; total: number }>;
  storiesDone: string[];
  totalMs: number;
}

/** What a device knows about the server: its data generation, and how far it has read. */
interface Cursors {
  epoch: number | null;
  logSeq: number;
  memRev: number;
}

const DAY = 86_400_000;

const emptyMeta = (): Meta => ({
  chosenLesson: null,
  days: [],
  prefsAt: 0,
  sentenceSeen: {},
  settings: {
    desiredRetention: 0.9,
    minutes: 15,
    rate: 0.9,
    textScale: 1,
    voice: null,
  },
  sounds: {},
  storiesDone: [],
  totalMs: 0,
});

/** The time all devices share. A test moves it forward. */
export const clock = { now: 1_795_000_000_000 };

export class Device {
  readonly memory = new Map<string, Mem>();
  readonly log = new Map<string, LogEntry>();
  meta = emptyMeta();
  /** What this device knows about the server. */
  cursors: Cursors = { epoch: null, logSeq: 0, memRev: 0 };
  private pushedAt = 0;
  private pendingReset: number | null = null;
  private readonly cookie: string;
  private readonly name: string;
  private made = 0;

  constructor(name: string, cookie: string, voice: string | null = null) {
    this.name = name;
    this.cookie = cookie;
    this.meta.settings.voice = voice;
  }

  private record(id: string, grade: LogEntry["grade"]) {
    this.made += 1;

    const uid = `${this.name}-${this.made}`;

    this.log.set(uid, { at: clock.now, carrier: false, grade, id, uid });
  }

  /** Learns new items. */
  teach(...ids: string[]) {
    for (const id of ids) {
      this.memory.set(id, {
        card: {
          cardId: id,
          difficulty: 2.1181,
          dueAt: new Date(clock.now + 5 * 60_000),
          lapses: 0,
          lastReviewAt: new Date(clock.now),
          learningStep: 1,
          reps: 1,
          scheduleStatus: "learning",
          scheduledDays: 0,
          stability: 2.3065,
          state: 1,
        },
        id,
        introducedAt: clock.now,
      });
      this.record(id, "new");
    }
  }

  /** Reviews an item it knows. */
  review(id: string, grade: "again" | "good" = "good") {
    const mem = this.memory.get(id);

    if (mem === undefined) {
      throw new Error(`${this.name} has not learned ${id}`);
    }

    this.memory.set(id, {
      ...mem,
      card: {
        ...mem.card,
        dueAt: new Date(clock.now + DAY),
        lastReviewAt: new Date(clock.now),
        reps: mem.card.reps + 1,
        scheduleStatus: "review",
        scheduledDays: 1,
        state: 2,
      },
    });
    this.record(id, grade);
  }

  study(ms: number, day: string) {
    this.meta = {
      ...this.meta,
      days: [...new Set([...this.meta.days, day])],
      totalMs: this.meta.totalMs + ms,
    };
  }

  setMinutes(minutes: number) {
    this.meta = {
      ...this.meta,
      prefsAt: clock.now,
      settings: { ...this.meta.settings, minutes },
    };
  }

  /** "Start over": drops everything here, and tells the server at the next sync. */
  startOver() {
    this.memory.clear();
    this.log.clear();
    this.meta = {
      ...emptyMeta(),
      settings: { ...emptyMeta().settings, voice: this.meta.settings.voice },
    };
    this.pendingReset = clock.now;
    this.pushedAt = 0;
  }

  private async post(path: string, body: string) {
    const response = await postText(path, body, this.cookie);

    return { body: await response.json<unknown>(), status: response.status };
  }

  private apply(remote: SyncResponse) {
    if (remote.reset) {
      this.memory.clear();
      this.log.clear();
    }

    for (const sent of remote.memory) {
      // Dates arrive as text; the app turns them back into dates.
      const mem: Mem = {
        ...sent,
        card: {
          ...sent.card,
          cardId: String(sent.card.cardId),
          dueAt: new Date(sent.card.dueAt),
          lastReviewAt:
            sent.card.lastReviewAt === null
              ? null
              : new Date(sent.card.lastReviewAt),
        },
      };

      const have = this.memory.get(mem.id);

      if (have === undefined || stampOf(have) < stampOf(mem)) {
        this.memory.set(mem.id, mem);
      }
    }

    if (remote.meta !== null) {
      const merged = remote.reset
        ? remote.meta
        : mergeMeta(v.parse(SyncedMetaSchema, this.meta), remote.meta);

      this.meta = {
        chosenLesson: merged.chosenLesson,
        days: merged.days,
        prefsAt: merged.prefsAt,
        sentenceSeen: merged.sentenceSeen,
        // The voice, speed and text size belong to this device.
        settings: {
          ...this.meta.settings,
          desiredRetention: merged.settings.desiredRetention,
          minutes: merged.settings.minutes,
        },
        sounds: merged.sounds,
        storiesDone: merged.storiesDone,
        totalMs: merged.totalMs,
      };
    }

    for (const entry of remote.log) {
      if (!this.log.has(entry.uid)) {
        this.log.set(entry.uid, entry);
      }
    }
  }

  /** Sends local changes and fetches remote ones, as the app's sync loop does. */
  async sync() {
    if (this.pendingReset !== null) {
      const { status } = await this.post(
        "/api/reset",
        JSON.stringify({ epoch: this.pendingReset })
      );

      if (status === 200) {
        this.cursors = { epoch: this.pendingReset, logSeq: 0, memRev: 0 };
        this.pushedAt = 0;
      } else if (status !== 409) {
        // 409: another device started over more recently. Its data wins.
        throw new Error(`Reset answered ${status}`);
      }

      this.pendingReset = null;
    }

    const startedAt = clock.now;
    const since = this.pushedAt;
    let memory = [...this.memory.values()].filter((m) => stampOf(m) >= since);
    let meta: Meta | null = this.meta;
    let queue = [...this.log.values()].filter((entry) => entry.at >= since);
    let more = true;
    let rounds = 0;

    while (more) {
      // oxlint-disable-next-line no-await-in-loop -- Each message carries the cursors from the answer to the one before.
      const { body, status } = await this.post(
        "/api/sync",
        JSON.stringify({
          epoch: this.cursors.epoch,
          log: queue.slice(0, LOG_PAGE),
          logSeq: this.cursors.logSeq,
          memRev: this.cursors.memRev,
          memory,
          meta,
        })
      );

      if (status !== 200) {
        throw new Error(`Sync answered ${status}: ${JSON.stringify(body)}`);
      }

      const answer = v.parse(SyncResponseSchema, body);

      queue = answer.reset ? [] : queue.slice(LOG_PAGE);
      memory = [];
      meta = null;
      this.apply(answer);
      this.cursors = {
        epoch: answer.epoch,
        logSeq: answer.logSeq,
        memRev: answer.memRev,
      };
      more = answer.more || queue.length > 0;
      rounds += 1;
    }

    this.pushedAt = startedAt;

    return rounds;
  }

  /** What the learner would see: everything except the settings that belong to one device. */
  data() {
    const {
      rate: _rate,
      textScale: _textScale,
      voice: _voice,
      ...settings
    } = this.meta.settings;

    return {
      log: [...this.log.values()].toSorted((a, b) =>
        a.uid.localeCompare(b.uid)
      ),
      memory: [...this.memory.values()]
        .map((mem) => JSON.stringify(mem))
        .toSorted(),
      meta: { ...this.meta, settings },
    };
  }
}
