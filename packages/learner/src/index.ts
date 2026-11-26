// The learner's data on this device, and its sync with the server. One learner is the data of
// one course: each course is kept apart from the others, on the device and on the server.
//
// This module hides where and how the data is kept (IndexedDB, its layout, and which database
// belongs to which course), the order of the writes and the repair after a crash between them,
// the sync loop with its cursors, retries, paging and generations ("Start over", "Restore
// backup"), the checks on everything that comes from the device, a backup file or the server,
// and the format of backup files.
//
// A caller makes one learner with `createLearner`, starts it, reads from it and sends it commands.
// The React hooks are in `@norsk/learner/react`.
export { createLearner } from "./learner";

export { DEFAULT_SETTINGS } from "./records";

export type {
  Account,
  Fetch,
  Host,
  Learner,
  LearnerDeps,
  Progress,
  Settings,
  SoundScore,
  SyncStatus,
} from "./types";
