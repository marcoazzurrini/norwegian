// Short explanations of a learner's mistake, written by a language model through OpenRouter.
// The app itself decides what is right and wrong; this only puts the reason into words.
import type { ExplainRequest } from "@norsk/protocol";
import * as v from "valibot";

const MODEL = "anthropic/claude-haiku-5.5";

const SYSTEM = `You help an English speaker who is a beginner in Norwegian (Bokmål). They translate short English sentences into Norwegian and type the answer. A separate program has already marked the answer as wrong; you only put the reason into words.

Rules:
- Speak to the learner as "you". Plain English, one or two short sentences, at most 35 words. No greeting, no praise, no lists, no Markdown.
- Put every Norwegian word in curly quotes, like “hus”.
- Use everyday words: "describing word" (not adjective), "en word", "ei word", "et word" (never neuter, masculine, feminine or common gender), "word order".
- Only talk about what really differs between the learner's answer and the expected sentence. Never invent a mistake.
- Explain the right form only. Do not say what the learner's wrong word means or where else it is used; you may be wrong about that.
- In Bokmål an ei word may also be used as an en word (“boka” or “boken”, “ei bok” or “en bok”). Both are correct.
- Ignore capital letters and punctuation.`;

const HINT = `Write a HINT for a second try. Say which word to look at again and what kind of thing to check (its ending, its place in the sentence, the choice of word). Do NOT write the correct word, the correct ending, the correct order or the correct sentence. The learner must still work it out.`;

const EXPLAIN = `The correct answer is now on screen. EXPLAIN in one or two sentences why the expected sentence is right at the point where the learner went wrong. Only if the learner's answer is itself correct, natural Bokmål for the English sentence, write instead: "Your answer also works." followed by one short reason. Otherwise do not mention that possibility at all.`;

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

const question = ({ answer, en, kind, no, topics }: ExplainRequest) => {
  const lines = [
    `English sentence: ${en}`,
    `Expected Norwegian: ${no}`,
    `Learner's answer: ${answer}`,
  ];

  if (topics.length > 0) {
    lines.push(
      `The program marked these as the weak points: ${topics.join("; ")}`
    );
  }

  lines.push("", kind === "hint" ? HINT : EXPLAIN);

  return lines.join("\n");
};

const ask = async (apiKey: string, request: ExplainRequest) => {
  try {
    return await fetch("https://openrouter.ai/api/v1/chat/completions", {
      body: JSON.stringify({
        max_tokens: 300,
        messages: [
          { content: SYSTEM, role: "system" },
          { content: question(request), role: "user" },
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

export const explain = async (
  apiKey: string,
  request: ExplainRequest
): Promise<Explanation> => {
  const response = await ask(apiKey, request);

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
