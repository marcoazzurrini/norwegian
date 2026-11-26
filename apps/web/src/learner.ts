// The learner of the course that is open: the data on this device and its sync, with the hooks that read it.
// Each course has its own learner (see course.ts); these are the ones of the course on screen.
import type { Learner } from "@norsk/learner";
import type { LearnerHooks } from "@norsk/learner/react";

import { openCourse } from "./course";

/** The learner of the course that is open. */
export const learner = (): Learner => openCourse().learner;

const hooks = (): LearnerHooks => openCourse().hooks;

export const useMemory: LearnerHooks["useMemory"] = () => hooks().useMemory();

export const useProgress: LearnerHooks["useProgress"] = () =>
  hooks().useProgress();

export const useReady: LearnerHooks["useReady"] = () => hooks().useReady();

export const useScheduler: LearnerHooks["useScheduler"] = () =>
  hooks().useScheduler();

export const useSettings: LearnerHooks["useSettings"] = () =>
  hooks().useSettings();

export const useSyncStatus: LearnerHooks["useSyncStatus"] = () =>
  hooks().useSyncStatus();
