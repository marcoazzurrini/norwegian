// Short explanations of a learner's mistake, written by a language model through OpenRouter.
// The app itself decides what is right and wrong; this only puts the reason into words.

export interface ExplainEnv {
  /** Set with `wrangler secret put OPENROUTER_API_KEY`. */
  OPENROUTER_API_KEY?: string
}

const MODEL = 'anthropic/claude-haiku-5.5'
const MAX_FIELD = 300
const MAX_TOPICS = 8

const SYSTEM = `You help an English speaker who is a beginner in Norwegian (Bokmål). They translate short English sentences into Norwegian and type the answer. A separate program has already marked the answer as wrong; you only put the reason into words.

Rules:
- Speak to the learner as "you". Plain English, one or two short sentences, at most 35 words. No greeting, no praise, no lists, no Markdown.
- Put every Norwegian word in curly quotes, like “hus”.
- Use everyday words: "describing word" (not adjective), "en word", "ei word", "et word" (never neuter, masculine, feminine or common gender), "word order".
- Only talk about what really differs between the learner's answer and the expected sentence. Never invent a mistake.
- Explain the right form only. Do not say what the learner's wrong word means or where else it is used; you may be wrong about that.
- In Bokmål an ei word may also be used as an en word (“boka” or “boken”, “ei bok” or “en bok”). Both are correct.
- Ignore capital letters and punctuation.`

const HINT = `Write a HINT for a second try. Say which word to look at again and what kind of thing to check (its ending, its place in the sentence, the choice of word). Do NOT write the correct word, the correct ending, the correct order or the correct sentence. The learner must still work it out.`

const EXPLAIN = `The correct answer is now on screen. EXPLAIN in one or two sentences why the expected sentence is right at the point where the learner went wrong. Only if the learner's answer is itself correct, natural Bokmål for the English sentence, write instead: "Your answer also works." followed by one short reason. Otherwise do not mention that possibility at all.`

const clean = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD) : '')

/** Returns the text, or null if the request is not usable or the model did not answer. */
export async function explain(env: ExplainEnv, body: unknown): Promise<{ status: number; text?: string; error?: string }> {
  if (!env.OPENROUTER_API_KEY) return { status: 503, error: 'Explanations are not set up' }
  const b = (body ?? {}) as Record<string, unknown>
  const kind = b.kind === 'hint' ? 'hint' : b.kind === 'explain' ? 'explain' : null
  const en = clean(b.en)
  const no = clean(b.no)
  const answer = clean(b.answer)
  const topics = Array.isArray(b.topics) ? b.topics.map(clean).filter(Boolean).slice(0, MAX_TOPICS) : []
  if (!kind || !en || !no || !answer) return { status: 400, error: 'Missing fields' }

  const user = [
    `English sentence: ${en}`,
    `Expected Norwegian: ${no}`,
    `Learner's answer: ${answer}`,
    topics.length ? `The program marked these as the weak points: ${topics.join('; ')}` : '',
    '',
    kind === 'hint' ? HINT : EXPLAIN,
  ]
    .filter((line, i) => line || i === 4)
    .join('\n')

  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'content-type': 'application/json', 'x-title': 'Norsk' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        temperature: 0.2,
        // A short answer needs no thinking first; thinking would also use up the token limit.
        reasoning: { enabled: false },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { status: 504, error: 'The model did not answer in time' }
  }
  if (!response.ok) return { status: 502, error: `The model answered with an error (${response.status})` }
  const data = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null
  const text = data?.choices?.[0]?.message?.content?.trim()
  return text ? { status: 200, text } : { status: 502, error: 'The model gave no text' }
}
