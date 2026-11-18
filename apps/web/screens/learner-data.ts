// The learner data that a script or a test puts into the browser before the app starts.
// This file imports nothing, so that a test runner without the app's build can load it.

/** The moment every picture is taken and every seeded test runs: a Tuesday morning in Oslo. */
export const NOW = new Date("2026-03-10T09:30:00+01:00").getTime();

/**
 * What is written into the browser's database (named `norsk`) before the app starts: plain rows
 * in the layout of `src/engine/store.ts`. A date may be text; the app reads it as a date when it loads.
 */
export interface Seed {
  /** Rows of the `memory` store, one per learned item. */
  memory: readonly { id: string }[];
  /** The `meta` row of the `meta` store, or null for a new learner. */
  meta: object | null;
  /** The `sync` row of the `meta` store, or null for a device that never signed in. */
  sync: object | null;
}

/** Runs inside the page: writes the rows into the database, creating it as the app would. */
export const writeSeed = async ({ memory, meta, sync }: Seed) => {
  // oxlint-disable-next-line promise/avoid-new -- the browser's database reports through events, which only a new promise can wait for
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("norsk", 2);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      db.createObjectStore("memory", { keyPath: "id" });

      const log = db.createObjectStore("log", { autoIncrement: true });

      log.createIndex("at", "at");
      log.createIndex("uid", "uid", { unique: true });
      db.createObjectStore("meta");
    });

    request.addEventListener("error", () => {
      reject(new Error("The database could not be opened"));
    });

    request.addEventListener("success", () => {
      const db = request.result;
      const tx = db.transaction(["memory", "meta"], "readwrite");

      for (const row of memory) {
        tx.objectStore("memory").put(row);
      }

      if (meta !== null) {
        tx.objectStore("meta").put(meta, "meta");
      }

      if (sync !== null) {
        tx.objectStore("meta").put(sync, "sync");
      }

      tx.addEventListener("complete", () => {
        db.close();
        resolve();
      });

      tx.addEventListener("error", () => {
        reject(new Error("The learner data could not be written"));
      });
    });
  });
};
