// The journal of the app: what happened in a session, kept to find out later why the app
// behaved as it did. Nothing here changes what the learner sees.
//
// Hides: which session an event belongs to, and when the events are sent to the server.
// A screen notes what happened and goes on.
import type { Session, Task, TaskResult } from "@norsk/engine";
import { createJournal, taskIds } from "@norsk/journal";
import type { EventKind, Events, SessionTotals } from "@norsk/journal";

import { report } from "./sentry";

const journal = createJournal({
  fetch: async (path, init) => await fetch(path, init),
  // The page is also drawn once when the app is built, where there is no database.
  // Nothing opens the database before the first event, which only a browser notes.
  indexedDB: globalThis.indexedDB,
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
  onError: report,
});

/** The session under way, as the journal knows it. */
interface Current {
  session: Session;
  id: string;
  /** The number of the last task that was noted. */
  count: number;
  /** The session reached its end. */
  over: boolean;
}

/** Null outside a session. Events noted during a session belong to it. */
let current: Current | null = null;

const totals = (session: Session): SessionTotals => ({
  elapsedMs: session.elapsedMs,
  timeUp: session.timeUp,
  ...session.stats,
});

const send = (): void => {
  journal.flush().catch(reportError);
};

/**
 * Notes that something happened, in the session under way if there is one.
 * `kind` is one of the events the journal lists, and `data` is what that event carries.
 */
export const note = <Kind extends EventKind>(
  kind: Kind,
  data: Events[Kind]
): void => {
  journal.record(kind, data, current?.id ?? null);
};

/**
 * Sends what waits when the app opens, when the connection comes back, and when the app goes to
 * the background, which is the last moment before a phone may close it. Call once, in the browser.
 */
export const startJournal = (): (() => void) => {
  const onHidden = (): void => {
    if (document.visibilityState === "hidden") {
      send();
    }
  };

  send();
  window.addEventListener("online", send);
  document.addEventListener("visibilitychange", onHidden);

  return () => {
    window.removeEventListener("online", send);
    document.removeEventListener("visibilitychange", onHidden);
  };
};

/**
 * The session chose its next task: which one, and why. `count` numbers the tasks of the session,
 * and `course` is the id of the course the session is in.
 * The first task of a session notes that the session began, and its last that it ended.
 * Telling the same task twice notes it once, so a screen may call this whenever it is drawn.
 */
export const noteTaskChosen = (
  course: string,
  session: Session,
  count: number,
  task: Task
): void => {
  if (current?.session !== session) {
    current = { count: 0, id: crypto.randomUUID(), over: false, session };
    note("session.started", {
      course,
      minutes: session.minutes,
      pace: session.pace,
    });
  }

  const choice = session.lastChoice;

  if (current.count >= count || choice === null) {
    return;
  }

  current.count = count;
  note("task.chosen", { ...choice, ...taskIds(task), count });

  if (task.type === "done") {
    note("session.ended", totals(session));
    current.over = true;
    send();
  }
};

/** A task ended: what it reported, how long it took, and how much of that counted. */
export const noteTaskDone = (
  count: number,
  result: TaskResult,
  ms: number,
  countedMs: number
): void => {
  note("task.done", { ...result, count, countedMs, ms });
};

/** The learner left the session's page. If the session had not ended, it was left before its end. */
export const noteSessionLeft = (): void => {
  if (current !== null && !current.over) {
    note("session.left", totals(current.session));
    send();
  }

  current = null;
};
