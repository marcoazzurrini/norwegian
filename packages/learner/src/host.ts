// The browser events and timers that wake the sync up, kept in one place so tests can replace them.
import type { Host } from "./types";

export const browserHost = (): Host => ({
  after: (ms, task) => {
    const timer = setTimeout(task, ms);

    return () => {
      clearTimeout(timer);
    };
  },

  onWake: (listener) => {
    const onVisible = (): void => {
      if (document.visibilityState === "visible") {
        listener();
      }
    };

    window.addEventListener("online", listener);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("online", listener);
      document.removeEventListener("visibilitychange", onVisible);
    };
  },
});
