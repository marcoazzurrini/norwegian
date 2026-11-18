// A request for a short explanation of a mistake, written by a language model.
import * as v from "valibot";

const MAX_TEXT = 300;
const MAX_TOPICS = 8;

/** One line of text: extra white space removed, and cut off if it is very long. */
const Line = v.pipe(
  v.string(),
  v.transform((text) =>
    text.replaceAll(/\s+/gu, " ").trim().slice(0, MAX_TEXT)
  ),
  v.minLength(1)
);

export const ExplainRequestSchema = v.object({
  /** What the learner typed. */
  answer: Line,
  /** The English sentence the learner was asked to say. */
  en: Line,
  /** "hint" must not give the answer away; "explain" comes after the answer is shown. */
  kind: v.picklist(["hint", "explain"]),
  /** The expected Norwegian. */
  no: Line,
  /** Names of the words and patterns the learner got wrong. Only the first few are used. */
  topics: v.pipe(
    v.array(Line),
    v.transform((topics) => topics.slice(0, MAX_TOPICS))
  ),
});

export type ExplainRequest = v.InferOutput<typeof ExplainRequestSchema>;

export const ExplainResponseSchema = v.object({ text: v.string() });

export type ExplainResponse = v.InferOutput<typeof ExplainResponseSchema>;

/** The body of every answer that is not a success. */
export const ErrorBodySchema = v.object({ error: v.string() });

export type ErrorBody = v.InferOutput<typeof ErrorBodySchema>;
