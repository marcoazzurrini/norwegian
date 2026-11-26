// The course that is open in this tab, with everything the app keeps for it: the learner's data
// and its sync, the voice, and the hooks that read them.
//
// Hides: that a course is loaded when it is first opened, and that each course has its own
// learner. A page of a course is only drawn once its course is open, so the rest of the app
// asks for "the course" and "the learner" without saying which.
import { currentUser, signIn, signOut } from "@norsk/auth/client";
import type { Course } from "@norsk/course";
import { courseMeta, firstCourse } from "@norsk/courses";
import { loadCourse } from "@norsk/courses/load";
import { createLearner } from "@norsk/learner";
import type { Learner } from "@norsk/learner";
import { createLearnerHooks } from "@norsk/learner/react";
import type { LearnerHooks } from "@norsk/learner/react";
import { createSpeech } from "@norsk/speech";
import type { Speech } from "@norsk/speech";

export interface OpenCourse {
  course: Course;
  learner: Learner;
  hooks: LearnerHooks;
  speech: Speech;
}

/** Where this device keeps the course that was open last. */
const LAST = "norsk-course";

const preparing = new Map<string, Promise<OpenCourse>>();
const prepared = new Map<string, OpenCourse>();

let open: OpenCourse | null = null;

const make = async (id: string): Promise<OpenCourse> => {
  const course = await loadCourse(id);

  const learner = createLearner({
    account: {
      currentUser: async () => {
        const user = await currentUser();

        return user === null ? null : user.email;
      },
      signIn,
      signOut,
    },
    course: id,
    fetch: async (path, init) => await fetch(path, init),
    // The page is also drawn once when the app is built, where there is no database.
    // Nothing opens the database before `start`, which only a browser calls.
    indexedDB: globalThis.indexedDB,
    newId: () => crypto.randomUUID(),
    now: () => Date.now(),
  });

  const made = {
    course,
    hooks: createLearnerHooks(learner),
    learner,
    speech: createSpeech({ course, settings: learner.settings }),
  };

  prepared.set(id, made);

  return made;
};

/**
 * Gets a course ready to be opened: loads it, and makes its learner and its voice.
 * Safe to call for a course that is not shown yet, such as one the pointer rests on.
 */
export const prepareCourse = async (id: string): Promise<void> => {
  const made = preparing.get(id) ?? make(id);

  preparing.set(id, made);
  await made;
};

/** Makes a prepared course the open one. Its pages call this before they draw anything. */
export const enterCourse = (id: string): OpenCourse => {
  const made = prepared.get(id);

  if (made === undefined) {
    throw new Error(`The course "${id}" is not prepared`);
  }

  open = made;

  return made;
};

/** The course that is open, with its learner and its voice. Only for the pages of a course. */
export const openCourse = (): OpenCourse => {
  if (open === null) {
    throw new Error("No course is open");
  }

  return open;
};

/** The course that is open. */
export const useCourse = (): Course => openCourse().course;

/** Notes the course as the one to open next time. */
export const rememberCourse = (id: string): void => {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    // A browser that refuses storage opens the first course next time, which is fine.
  }
};

/** True if the app has a course with this id. */
export const isCourse = (id: string): boolean => courseMeta(id) !== undefined;

/** The id of the course to open when the address names none: the one open last, or the first. */
const startCourse = (): string => {
  try {
    const last = localStorage.getItem(LAST);

    if (last !== null && isCourse(last)) {
      return last;
    }
  } catch {
    // No storage: the first course.
  }

  return firstCourse().id;
};

/** The parts of an address that say which page it is. */
interface Address {
  pathname: string;
  /** The part after "?", with the "?", or "". */
  searchStr: string;
  /** The part after "#", without the "#", or "". */
  hash: string;
}

/**
 * The same page in the course to open by default, for an address that names no course:
 * the bare site, or a link from before there were courses. The rest of the address is kept.
 */
export const addressInCourse = ({
  pathname,
  searchStr,
  hash,
}: Address): string =>
  `/${startCourse()}${pathname === "/" ? "" : pathname}${searchStr}${hash === "" ? "" : `#${hash}`}`;
