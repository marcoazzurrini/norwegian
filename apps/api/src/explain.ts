// Short explanations of a learner's mistake, written by a language model through OpenRouter.
// The app itself decides what is right and wrong; this only puts the reason into words.
//
// The words that depend on the language come from the course (its `tutor`); nothing here names a language.
import type { CourseMeta } from "@norsk/course";
import type { ExplainRequest } from "@norsk/protocol";
import * as v from "valibot";

const MODEL = "anthropic/claude-haiku-5.5";

/** The everyday words the model must use, with those of the course between the two every language has. */
const everyday = ({ tutor }: CourseMeta): string =>
  [
    '"describing word" (not adjective)',
    ...(tutor.everyday === null ? [] : [tutor.everyday]),
    '"word order"',
  ].join(", ");

/** What the model is told about its task, for one course. */
const system = (course: CourseMeta): string => {
  const { base, name, tutor } = course;

  return [
    `You help ${tutor.learner} who is a beginner in ${tutor.language}. They translate short ${base} sentences into ${name} and type the answer. A separate program has already marked the answer as wrong; you only put the reason into words.`,
    "",
    "Rules:",
    `- Speak to the learner as "you". Plain ${base}, one or two short sentences, at most 35 words. No greeting, no praise, no lists, no Markdown.`,
    `- Put every ${name} word in curly quotes, like “${tutor.word}”.`,
    `- Use everyday words: ${everyday(course)}.`,
    "- Only talk about what really differs between the learner's answer and the expected sentence. Never invent a mistake.",
    "- Explain the right form only. Do not say what the learner's wrong word means or where else it is used; you may be wrong about that.",
    ...tutor.rules.map((rule) => `- ${rule}`),
    "- Ignore capital letters and punctuation.",
  ].join("\n");
};

const HINT = `Write a HINT for a second try. Say which word to look at again and what kind of thing to check (its ending, its place in the sentence, the choice of word). Do NOT write the correct word, the correct ending, the correct order or the correct sentence. The learner must still work it out.`;

const explainTask = ({ base, tutor }: CourseMeta): string =>
  `The correct answer is now on screen. EXPLAIN in one or two sentences why the expected sentence is right at the point where the learner went wrong. Only if the learner's answer is itself correct, natural ${tutor.standard} for the ${base} sentence, write instead: "Your answer also works." followed by one short reason. Otherwise do not mention that possibility at all.`;

/** The part of OpenRouter's answer that is used: the text of the first choice. */
const CompletionSchema = v.object({
  choices: v.tupleWithRest(
    [v.object({ message: v.object({ content: v.string() }) })],
    v.unknown()
  ),
});

/** The text, or why there is none: 504 if the model was too slow, 502 if its answer was no use. */
export type Explanation =
  | { ok: true; text: string }
  | { error: string; ok: false; status: 502 | 504 };

const question = (
  course: CourseMeta,
  { answer, base, kind, target, topics }: ExplainRequest
) => {
  const lines = [
    `${course.base} sentence: ${base}`,
    `Expected ${course.name}: ${target}`,
    `Learner's answer: ${answer}`,
  ];

  if (topics.length > 0) {
    lines.push(
      `The program marked these as the weak points: ${topics.join("; ")}`
    );
  }

  lines.push("", kind === "hint" ? HINT : explainTask(course));

  return lines.join("\n");
};

const ask = async (
  apiKey: string,
  course: CourseMeta,
  request: ExplainRequest
) => {
  try {
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      body: JSON.stringify({
        max_tokens: 300,
        messages: [
          { content: system(course), role: "system" },
          { content: question(course, request), role: "user" },
        ],
        model: MODEL,
        // A short answer needs no thinking first; thinking would also use up the token limit.
        reasoning: { enabled: false },
        temperature: 0.2,
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-title": "Norsk",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // No connection, or no answer within the time limit.
    return null;
  }
};

/** `course` is the course the request is about. */
export const explain = async (
  apiKey: string,
  course: CourseMeta,
  request: ExplainRequest
): Promise<Explanation> => {
  const response = await ask(apiKey, course, request);

  if (response === null) {
    return {
      error: "The model did not answer in time",
      ok: false,
      status: 504,
    };
  }

  if (!response.ok) {
    return {
      error: `The model answered with an error (${response.status})`,
      ok: false,
      status: 502,
    };
  }

  const completion = v.safeParse(
    CompletionSchema,
    await response.json().catch(() => null)
  );

  const text = completion.success
    ? completion.output.choices[0].message.content.trim()
    : "";

  return text === ""
    ? { error: "The model gave no text", ok: false, status: 502 }
    : { ok: true, text };
};
