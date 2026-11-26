// The public types of the learner module.
import type { Mem, Pace, ReviewInput, Scheduler } from "@norsk/engine";

export interface Settings {
  /** Length of a session, in minutes. Shared between devices. */
  minutes: number;
  /** The chance of recall the scheduler aims for, from 0 to 1. Shared between devices. */
  desiredRetention: number;
  /** Name of the browser voice. Belongs to this device. */
  voice: string | null;
  /** Speed of speech. Belongs to this device. */
  rate: number;
  /** Size of the text. Belongs to this device. */
  textScale: number;
}

export interface SoundScore {
  right: number;
  total: number;
}

/** What the learner has done so far, apart from the memories. */
export interface Progress {
  /** Active study time in milliseconds. */
  readonly totalMs: number;
  /** Calendar days with at least one finished task, as YYYY-MM-DD. */
  readonly days: readonly string[];
  readonly storiesDone: readonly string[];
  /** Lesson picked on the Map, taught next if it is ready. */
  readonly chosenLesson: number | null;
  /** When each sentence was last used as a review. */
  readonly sentenceSeen: Readonly<Record<string, number>>;
  /** Right and total answers per sound group. */
  readonly sounds: Readonly<Record<string, SoundScore>>;
  /** How long the latest tasks took, for each kind of work. Belongs to this device. */
  readonly pace: Pace;
}

export interface SyncStatus {
  /** True if this device is signed in, as far as it knows. */
  linked: boolean;
  account: string | null;
  /** False until this device knows whether it is signed in. */
  checked: boolean;
  busy: boolean;
  error: string | null;
  lastOkAt: number | null;
  /** How many records of the last sync this version of the app could not read. They were left out. */
  skipped: number;
}

/** Who is signed in. The app implements this with its sign-in client. */
export interface Account {
  /** The email address that is signed in, or null. Rejects when the server cannot be reached. */
  currentUser: () => Promise<string | null>;
  /** Starts signing in. Rejects when it could not start. */
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** The parts of the browser that wake the sync up. Tests pass their own. */
export interface Host {
  /** Calls `listener` when the browser comes online or the page becomes visible. Returns a function that stops it. */
  onWake: (listener: () => void) => () => void;
  /** Runs `task` once, after `ms` milliseconds. Returns a function that cancels it. */
  after: (ms: number, task: () => void) => () => void;
}

export type Fetch = (path: string, init: RequestInit) => Promise<Response>;

export interface LearnerDeps {
  /**
   * The short name of the course this learner studies: "no", "de". Each course has its own data,
   * on this device and on the server, so a learner only ever sees and changes its own course.
   */
  course: string;
  /** Where the data is kept on this device. */
  indexedDB: IDBFactory;
  fetch: Fetch;
  /** The current time in milliseconds. */
  now: () => number;
  /** A new id, unique across devices. */
  newId: () => string;
  account: Account;
  /** Defaults to the browser's own events and timers. */
  host?: Host;
}

export interface Learner {
  /** Loads the data from this device, then starts syncing. Safe to call more than once. */
  start: () => Promise<void>;
  /** Stops timers and listeners and closes the data. For tests and reloads during development. */
  stop: () => void;

  /** True once the data on this device is loaded. Commands and `scheduler` need this. */
  ready: () => boolean;
  memory: () => ReadonlyMap<string, Mem>;
  settings: () => Settings;
  progress: () => Progress;
  syncStatus: () => SyncStatus;
  scheduler: () => Scheduler;
  /** Calls `listener` after any read above may have changed. Returns a function that stops it. */
  subscribe: (listener: () => void) => () => void;

  /** Records the first successful recall of new items. Items already learned are left alone. */
  teach: (ids: readonly string[]) => Promise<void>;
  applyReviews: (inputs: readonly ReviewInput[]) => Promise<void>;
  /** Adds active study time and marks today as a study day. */
  addStudyTime: (ms: number) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** Picks the lesson to teach next, or clears the choice with null. */
  chooseLesson: (index: number | null) => Promise<void>;
  markStoryDone: (id: string) => Promise<void>;
  /** Notes that a sentence was used as a review, now or at the given time. */
  markSentenceSeen: (id: string, at?: number) => Promise<void>;
  recordSound: (group: string, right: boolean) => Promise<void>;
  /** Keeps how long the latest tasks took, so the next session can plan its time with it. */
  savePace: (pace: Pace) => Promise<void>;

  /** Everything of this course on this device, as the text of a backup file. */
  exportBackup: () => Promise<string>;
  /**
   * Replaces all progress in this course with a backup file, here and on every signed-in device.
   * Rejects if the file is not a backup, or is a backup of another course.
   */
  restoreBackup: (json: string) => Promise<void>;
  /** Deletes all progress in this course, here and on every signed-in device. Other courses are left alone. */
  startOver: () => Promise<void>;

  /** Sends local changes and fetches remote ones. Calls made while a sync runs are folded into one follow-up. */
  syncNow: () => Promise<void>;
  signIn: () => Promise<void>;
  /** Signs this device out. Progress stays on the device and on the server. */
  signOut: () => Promise<void>;
}
