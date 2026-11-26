// Loads a course. Each course is fetched when it is first opened, so a learner
// never downloads the curriculum of a language they do not study.
import type { Course } from "@norsk/course";

const LOADERS = new Map<string, () => Promise<Course>>([
  [
    "no",
    async () => {
      const loaded = await import("@norsk/norwegian");

      return loaded.course;
    },
  ],
  [
    "es",
    async () => {
      const loaded = await import("@norsk/spanish");

      return loaded.course;
    },
  ],
]);

const loaded = new Map<string, Promise<Course>>();

/** The course with this id. Rejects if there is none. Asking twice loads it once. */
export const loadCourse = async (id: string): Promise<Course> => {
  const load = LOADERS.get(id);

  if (load === undefined) {
    throw new Error(`Unknown course "${id}"`);
  }

  const course = loaded.get(id) ?? load();

  loaded.set(id, course);

  return await course;
};
