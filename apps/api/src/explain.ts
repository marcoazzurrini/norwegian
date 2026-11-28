// Short explanations of a learner's mistake, written by a language model through OpenRouter.
// The app itself decides what is right and wrong; this only puts the reason into words.
//
// The words that depend on the language come from the course (its `tutor`); nothing here names a language.
import type { CourseMeta } from "@norsk/course";
import type { ExplainRequest } from "@norsk/protocol";
import * as v from "valibot";

const MODEL = "openai/gpt-6.2-sol";

/**
 * How long the model may take. It thinks before it writes, which takes a few seconds; after this
 * long the learner has moved on.
 */
const TIMEOUT_MS = 25_000;

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
    `You are the tutor of a language course. The learner is ${tutor.learner} and a beginner in ${tutor.language}. They read a short ${base} sentence and type it in ${name}. A program compares the answer with the expected sentence and tells you where the two differ. You write a short note about those differences.`,
    "",
    "What the program tells you is true. Do not look for other mistakes, and never invent one.",
    "",
    "How to write:",
    `- Speak to the learner as "you". Never write "the learner".`,
    `- Plain ${base}. One or two short sentences, 30 words at most. No greeting, no praise, no lists, no Markdown.`,
    `- Put every ${name} word in curly quotes, like “${tutor.word}”. Put nothing else in curly quotes.`,
    `- Use everyday words: ${everyday(course)}.`,
    `- Name a form of a word the way the course notes name it, in straight quotes: the "the" form, the "now" form.`,
    "- Never mention capital letters or punctuation.",
    "",
    "What to say:",
    "- Write about the listed differences only. If there are several, start with the one that matters most, and leave out what does not fit in the length.",
    `- "The right word in the wrong form": the learner knows the word. Say which form this sentence needs, and why.`,
    `- "Not a form of the expected word": the learner misspelled the word or chose another word. If what they typed is close to the expected word, it is a spelling slip: say what the right spelling is and nothing else. Do not explain grammar that the learner may have got right.`,
    "- A missing word, or a word too many: say what that word does in the sentence.",
    "- Take every rule and every form from the course notes. If the notes do not cover the point, give the right form without a rule. Never state a rule of your own, and never widen a rule: what the notes say about one kind of word must not be said about all words.",
    `- Say what a wrong word means only if you are certain that it is a real ${name} word with that meaning. A word that is neither in the notes nor known to you for certain is a misspelling: give it no meaning.`,
    ...tutor.rules.map((rule) => `- ${rule}`),
  ].join("\n");
};

const hintTask = ({ base }: CourseMeta): string =>
  [
    "Task: write a HINT for a second try. The learner has not seen the expected sentence.",
    `Point to the place, and say what kind of thing to check: the spelling, the form of the word, the choice of word, a missing word, a word too many, or the word order. Name the place by its ${base} meaning (the word for "room"), or quote the learner's own wrong word.`,
    'Never write a word of the expected sentence that the learner did not type, and never its ending or what a rule makes of it (such as "it takes no ending"). The learner must still work it out. One sentence, 20 words at most.',
  ].join("\n");

const explainTask = ({ base, tutor }: CourseMeta): string =>
  [
    "Task: the expected sentence is now on screen. EXPLAIN why it is right at the places where the answer differs.",
    `Only if the learner's whole answer is itself correct, natural ${tutor.standard} for the ${base} sentence, write instead: "Your answer also works." and one short reason. If you are not certain of that, do not mention it.`,
  ].join("\n");

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

/** A list under a heading, or nothing when the list is empty. */
const listed = (heading: string, lines: string[]): string[] =>
  lines.length === 0 ? [] : ["", heading, ...lines.map((line) => `- ${line}`)];

const question = (
  course: CourseMeta,
  { answer, base, differences, kind, target, topics }: ExplainRequest
) =>
  [
    `${course.base} sentence: ${base}`,
    `Expected ${course.name}: ${target}`,
    `The learner typed: ${answer}`,
    ...listed("Where the answer differs, as the program found:", differences),
    ...listed(
      "Course notes on the words and patterns at those places:",
      topics
    ),
    "",
    kind === "hint" ? hintTask(course) : explainTask(course),
  ].join("\n");

/** The words of a text, in lower case. */
const wordsOf = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];

/**
 * True if a hint writes a word of the expected sentence that the learner did not type.
 * Only the words in curly quotes are looked at: those are the words in the language of the course,
 * and a short one such as "to" would otherwise be found in the words around them.
 */
const givesAway = (hint: string, { answer, target }: ExplainRequest) => {
  const typed = new Set(wordsOf(answer));
  const secret = new Set(wordsOf(target).filter((word) => !typed.has(word)));

  return [...hint.matchAll(/“(?<quoted>[^”]*)”/gu)]
    .flatMap((match) => wordsOf(match.groups?.quoted ?? ""))
    .some((word) => secret.has(word));
};

const ask = async (
  apiKey: string,
  course: CourseMeta,
  request: ExplainRequest
) => {
  try {
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      body: JSON.stringify({
        // The limit counts the thinking too, which is many times longer than the note.
        max_tokens: 4000,
        messages: [
          { content: system(course), role: "system" },
          { content: question(course, request), role: "user" },
        ],
        model: MODEL,
        // The model compares the forms and reads the notes before it writes. Without that
        // step a model stated rules that were not in the notes.
        reasoning: { effort: "medium" },
        verbosity: "low",
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "x-title": "Norsk",
      },
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
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

  if (text === "") {
    return { error: "The model gave no text", ok: false, status: 502 };
  }

  // A hint that shows the answer is worse than none: the app's own hint stays on screen.
  return request.kind === "hint" && givesAway(text, request)
    ? { error: "The hint gave the answer away", ok: false, status: 502 }
    : { ok: true, text };
};
