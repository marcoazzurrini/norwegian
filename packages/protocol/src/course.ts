// Which course a message is about. The learner's data is kept apart for each course.
import * as v from "valibot";

/** The short name of a course, as it stands in the address of its pages: "no", "de". */
export const CourseIdSchema = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9-]{0,19}$/u)
);

export type CourseId = v.InferOutput<typeof CourseIdSchema>;

/**
 * The course that everything belongs to that was made before there were courses: a message
 * from an older version of the app, a row stored by an older server, a backup file without a course.
 */
export const FIRST_COURSE: CourseId = "no";

/** The course of a message. One that does not name a course is from before there were courses. */
export const MessageCourseSchema = v.optional(CourseIdSchema, FIRST_COURSE);
