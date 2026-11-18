// Puts the data and the sync together behind the public interface.
import { createData } from "./data";
import { browserHost } from "./host";
import { createSync } from "./sync";
import type { Learner, LearnerDeps } from "./types";

export const createLearner = (deps: LearnerDeps): Learner => {
  const data = createData(deps);

  const sync = createSync({
    account: deps.account,
    data,
    fetch: deps.fetch,
    host: deps.host ?? browserHost(),
    now: deps.now,
  });

  let starting: Promise<void> | null = null;

  return {
    addStudyTime: data.addStudyTime,
    applyReviews: data.applyReviews,
    chooseLesson: data.chooseLesson,
    exportBackup: data.exportBackup,
    markSentenceSeen: data.markSentenceSeen,
    markStoryDone: data.markStoryDone,
    memory: () => data.store.state.memory,
    progress: () => data.store.state.progress,
    ready: () => data.store.state.ready,
    recordSound: data.recordSound,
    restoreBackup: sync.restoreBackup,

    scheduler: () => {
      const { scheduler } = data.store.state;

      if (scheduler === null) {
        throw new Error("The learner's data is not loaded yet");
      }

      return scheduler;
    },

    settings: () => data.store.state.meta.settings,
    signIn: sync.signIn,
    signOut: sync.signOut,

    start: async () => {
      starting ??= (async () => {
        await data.load();
        await sync.start();
      })();

      await starting;
    },

    startOver: sync.startOver,

    stop: () => {
      sync.stop();
      data.close();
    },

    subscribe: (listener) => {
      const subscriptions = [
        data.store.subscribe(listener),
        sync.status.subscribe(listener),
      ];

      return () => {
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }
      };
    },

    syncNow: sync.syncNow,
    syncStatus: () => sync.status.state,
    teach: data.teach,
    updateSettings: data.updateSettings,
  };
};
