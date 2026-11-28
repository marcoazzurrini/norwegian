// A request for a short explanation of a mistake, written by a language model.
import * as v from "valibot";

import { CourseIdSchema, FIRST_COURSE } from "./course";

const MAX_TEXT = 300;
const MAX_TOPICS = 8;
const MAX_DIFFERENCES = 8;

/** One line of text: extra white space removed, and cut off if it is very long. */
const Line = v.pipe(
  v.string(),
  v.transform((text) =>
    text.replaceAll(/\s+/gu, " ").trim().slice(0, MAX_TEXT)
  ),
  v.minLength(1)
);

/** What every version of the request has. */
const SHARED = {
  /** What the learner typed. */
  answer: Line,
  /** "hint" must not give the answer away; "explain" comes after the answer is shown. */
  kind: v.picklist(["hint", "explain"]),
  /** Names of the words and patterns the learner got wrong. Only the first few are used. */
  topics: v.pipe(
    v.array(Line),
    v.transform((topics) => topics.slice(0, MAX_TOPICS))
  ),
};

const CurrentSchema = v.object({
  ...SHARED,
  /**
   * Where the answer differs from the expected sentence, one line for each place, as the app found them.
   * Versions from before the app sent them have none.
   */
  differences: v.optional(
    v.pipe(
      v.array(Line),
      v.transform((differences) => differences.slice(0, MAX_DIFFERENCES))
    ),
    []
  ),
  /** The sentence the learner was asked to say, in their own language. */
  base: Line,
  /** The course the sentence is from. */
  course: CourseIdSchema,
  /** The expected sentence, in the language of the course. */
  target: Line,
});

/** The request of the versions from before there were courses: `en` is the meaning, `no` the expected sentence. */
const FirstSchema = v.pipe(
  v.object({ ...SHARED, en: Line, no: Line }),
  v.transform(({ en, no, ...rest }) => ({
    ...rest,
    base: en,
    course: FIRST_COURSE,
    differences: [],
    target: no,
  }))
);

/** Reads the request of this version and of every earlier one. The output is always the current shape. */
export const ExplainRequestSchema = v.union([CurrentSchema, FirstSchema]);

export type ExplainRequest = v.InferOutput<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = v.object({ text: v.string() });

export type ExplainResponse = v.InferOutput<typeof ExplainResponseSchema>;

/** The body of every answer that is not a success. */
export const ErrorBodySchema = v.object({ error: v.string() });

export type ErrorBody = v.InferOutput<typeof ErrorBodySchema>;
