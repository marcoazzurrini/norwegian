// The courses the app offers. This list is the only place that names them.
//
// A new course is a package that exports a `Course`, and one line here and one in load.ts.
// This file holds only the short descriptions, so the server and the first page can list
// the courses without loading a curriculum.
import type { CourseMeta } from "@norsk/course";
import { meta as norwegian } from "@norsk/norwegian/meta";

/** Every course, in the order the app lists them. The first is the one a new learner starts in. */
export const courses: readonly CourseMeta[] = [norwegian];

/** The course with this id, or undefined if there is none. */
export const courseMeta = (id: string): CourseMeta | undefined =>
  courses.find((course) => course.id === id);

/** The course a learner is in before they have chosen one. */
export const firstCourse = (): CourseMeta => {
  const [first] = courses;

  if (first === undefined) {
    throw new Error("The app has no course");
  }

  return first;
};
