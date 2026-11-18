// The one learner of the app: the data on this device and its sync, with the hooks that read it.
import { currentUser, signIn, signOut } from "@norsk/auth/client";
import { createLearner } from "@norsk/learner";
import { createLearnerHooks } from "@norsk/learner/react";

export const learner = createLearner({
  account: {
    currentUser: async () => {
      const user = await currentUser();

      return user === null ? null : user.email;
    },
    signIn,
    signOut,
  },
  fetch: async (path, init) => await fetch(path, init),
  // The page is also drawn once when the app is built, where there is no database.
  // Nothing opens the database before `start`, which only a browser calls.
  indexedDB: globalThis.indexedDB,
  newId: () => crypto.randomUUID(),
  now: () => Date.now(),
});

export const {
  useMemory,
  useProgress,
  useReady,
  useScheduler,
  useSettings,
  useSyncStatus,
} = createLearnerHooks(learner);
