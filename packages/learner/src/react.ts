// React hooks for the learner's reads. Each hook watches one part, so a review does not draw
// again the screens that only show the settings.
import type { Mem, Scheduler } from "@norsk/engine";
import { useSyncExternalStore } from "react";

import type { Learner, Progress, Settings, SyncStatus } from "./index";

export interface LearnerHooks {
  /** True once the data on this device is loaded. */
  useReady: () => boolean;
  useMemory: () => ReadonlyMap<string, Mem>;
  useSettings: () => Settings;
  useProgress: () => Progress;
  useSyncStatus: () => SyncStatus;
  /** Only for screens shown after `useReady` gave true. */
  useScheduler: () => Scheduler;
}

/** Makes the hooks for one learner. Call it once, next to where the learner is made. */
export const createLearnerHooks = (learner: Learner): LearnerHooks => {
  // React draws a component again only when the value its hook reads is a different one.
  const useRead = <Part>(read: () => Part): Part =>
    useSyncExternalStore(learner.subscribe, read, read);

  return {
    useMemory: () => useRead(learner.memory),
    useProgress: () => useRead(learner.progress),
    useReady: () => useRead(learner.ready),
    useScheduler: () => useRead(learner.scheduler),
    useSettings: () => useRead(learner.settings),
    useSyncStatus: () => useRead(learner.syncStatus),
  };
};
