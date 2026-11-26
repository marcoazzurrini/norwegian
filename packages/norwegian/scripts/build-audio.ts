// Records every Norwegian text of the curriculum with ElevenLabs and uploads the files to R2.
//
//   bun scripts/build-audio.ts voices                 list Norwegian voices in the ElevenLabs library
//   bun scripts/build-audio.ts sample <voice-id>...   record a few texts per voice into data/audio/samples
//   bun scripts/build-audio.ts add <slug> <voice-id>  add a voice to text/audio.json
//   bun scripts/build-audio.ts build [--dry]          record what is missing, upload it, switch the app over
//
// Needs ELEVENLABS_API_KEY in .env. Uploading needs the sync key in .sync-key.
// Recordings are kept in data/audio (not in git), so nothing is ever paid for twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { audioKey, spokenText } from "@norsk/course";
import * as v from "valibot";

import { course } from "../src/index";

const { items, sentences, sounds, stories } = course;

const ROOT = path.join(import.meta.dir, "..");
const CONFIG = path.join(ROOT, "text/audio.json");
const LIVE = path.join(ROOT, "src/audio.json");
const STORE = path.join(ROOT, "data/audio");
const SITE = process.env.SITE ?? "https://norwegian.marcoazzurrini.com";
const API = "https://api.elevenlabs.io";

const VoiceSchema = v.object({
  /** Folder name in R2: lower-case letters, digits and hyphens. */
  slug: v.string(),
  id: v.string(),
  name: v.string(),
});

type Voice = v.InferOutput<typeof VoiceSchema>;

const ConfigSchema = v.object({
  model: v.string(),
  voices: v.array(VoiceSchema),
});

/** A detail of a library voice that is only printed. One that is missing or not a plain value is left empty. */
const PrintedSchema = v.fallback(
  v.optional(
    v.pipe(v.union([v.string(), v.number(), v.boolean()]), v.transform(String)),
    ""
  ),
  ""
);

/** A voice of the ElevenLabs library. Only the id is relied on. */
const SharedVoiceSchema = v.object({
  voice_id: v.string(),
  name: PrintedSchema,
  gender: PrintedSchema,
  age: PrintedSchema,
  accent: PrintedSchema,
  language: PrintedSchema,
  locale: PrintedSchema,
  category: PrintedSchema,
  usage_character_count_1y: PrintedSchema,
  cloned_by_count: PrintedSchema,
  free_users_allowed: PrintedSchema,
  public_owner_id: PrintedSchema,
  description: PrintedSchema,
  preview_url: PrintedSchema,
});

type SharedVoice = v.InferOutput<typeof SharedVoiceSchema>;

const SharedVoicesSchema = v.object({ voices: v.array(SharedVoiceSchema) });

/** The audio server lists the files it has as "voice/key.mp3". */
const AudioListSchema = v.array(v.string());

const config = v.parse(ConfigSchema, JSON.parse(readFileSync(CONFIG, "utf-8")));
const flag = (name: string) => process.argv.includes(`--${name}`);

const option = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);

  return i > 0 ? process.argv[i + 1] : undefined;
};

const apiKey = (): string => {
  const key = process.env.ELEVENLABS_API_KEY;

  if (key === undefined || key === "") {
    throw new Error("Set ELEVENLABS_API_KEY in .env");
  }

  return key;
};

/**
 * Does every job, with at most `atOnce` of them running at the same time.
 * With `atOnce` 1 the jobs run one after the other, in order.
 */
const runJobs = async <Job>(
  jobs: readonly Job[],
  atOnce: number,
  work: (job: Job) => Promise<void>
) => {
  const queue = [...jobs];

  const worker = async () => {
    for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- a worker must finish one job before it takes the next: the number of workers is the limit on requests in flight
      await work(job);
    }
  };

  await Promise.all(Array.from({ length: atOnce }, worker));
};

/** Every text the app can speak. */
const texts = (): string[] => {
  const all = new Set<string>();

  const add = (text: string | undefined) => {
    const spoken = spokenText(text ?? "");

    if (spoken !== "") {
      all.add(spoken);
    }
  };

  for (const it of Object.values(items)) {
    if (it.kind !== "pattern") {
      add(it.text);
      // An item is spoken as it is shown: a noun with its article ("et rom"), a verb with "å".
      add(it.display);
    }

    for (const ex of it.examples ?? []) {
      // "en bil > bilen" shows a change: only the result is spoken.
      add(ex.target.split(">").pop());
    }

    for (const q of it.quiz ?? []) {
      add(q.prompt);
    }
  }

  for (const s of sentences) {
    add(s.target);
  }

  for (const st of stories) {
    for (const line of st.lines) {
      add(line.target);
    }

    for (const word of Object.keys(st.glosses)) {
      add(word);
    }
  }

  for (const p of sounds) {
    add(p.a.word);
    add(p.b.word);
  }

  return [...all];
};

/** A lone word needs its full stop: without it the voice can trail off or sound like a question. */
const forSpeech = (text: string) => (/[.!?]$/u.test(text) ? text : `${text}.`);

const record = async (
  voiceId: string,
  text: string,
  model: string,
  attempt = 1
): Promise<Buffer> => {
  // The v4 models are only offered through the dialogue endpoint.
  const dialogue = model.startsWith("eleven_v4");

  const url = dialogue
    ? `${API}/v1/text-to-dialogue?output_format=mp3_44100_128`
    : `${API}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;

  const body = dialogue
    ? {
        inputs: [{ text: forSpeech(text), voice_id: voiceId }],
        model_id: model,
        language_code: "no",
      }
    : { text: forSpeech(text), model_id: model, language_code: "no" };

  const response = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return Buffer.from(await response.arrayBuffer());
  }

  const answer = await response.text();

  // Too many requests or a server fault: wait and try again. Anything else will not fix itself.
  if ((response.status === 429 || response.status >= 500) && attempt < 8) {
    await Bun.sleep(attempt * 3000);

    return await record(voiceId, text, model, attempt + 1);
  }

  throw new Error(
    `ElevenLabs answered ${response.status} for "${text}": ${answer.slice(0, 400)}`
  );
};

const printVoice = (voice: SharedVoice) => {
  console.log(
    [
      voice.voice_id,
      voice.name,
      voice.gender,
      voice.age,
      voice.accent,
      voice.language,
      voice.locale,
      voice.category,
      `uses:${voice.usage_character_count_1y}`,
      `clones:${voice.cloned_by_count}`,
      `free:${voice.free_users_allowed}`,
      `owner:${voice.public_owner_id}`,
    ].join(" | ")
  );
  console.log(`    ${voice.description.slice(0, 160)}`);
  console.log(`    ${voice.preview_url}`);
};

const listVoices = async () => {
  const found = new Map<string, SharedVoice>();

  // The voice library answers without a key, but then only the first three voices of a search.
  // Many narrow searches are used on purpose, so a key limited to speech generation is enough for this script.
  const filters = [
    "",
    "gender=male",
    "gender=female",
    "age=young",
    "age=middle_aged",
    "age=old",
    "category=professional",
    "category=high_quality",
    "featured=true",
  ];

  const sorts = [
    "",
    "sort=trending",
    "sort=cloned_by_count",
    "sort=usage_character_count_1y",
    "sort=created_date",
  ];

  const searches = ["language=no", "search=norwegian", "search=norsk"].flatMap(
    (base) =>
      filters.flatMap((filter) =>
        sorts.map((sort) =>
          [base, filter, sort].filter((part) => part !== "").join("&")
        )
      )
  );

  // One search at a time, so the library is not flooded.
  await runJobs(searches, 1, async (search) => {
    const response = await fetch(
      `${API}/v1/shared-voices?page_size=3&${search}`
    );

    if (!response.ok) {
      return;
    }

    const { voices } = v.parse(SharedVoicesSchema, await response.json());

    for (const voice of voices) {
      found.set(voice.voice_id, voice);
    }
  });

  for (const voice of found.values()) {
    printVoice(voice);
  }

  console.log(`${found.size} voices`);
};

const SAMPLE = [
  "hei",
  "takk",
  "et hus",
  "å snakke",
  "kjøpe",
  "skje",
  "jeg",
  "ikke",
  "ha det bra",
  "Hva heter du?",
  "Jeg bor i Oslo, men jeg kommer fra Bergen.",
  "Kan du snakke litt saktere?",
];

const sample = async (voiceIds: string[]) => {
  const models = (option("model") ?? config.model).split(",");

  const folders = voiceIds.flatMap((id) =>
    models.map((model) => ({ id, model }))
  );

  // One recording at a time: samples are few, and the order of the log stays readable.
  await runJobs(folders, 1, async ({ id, model }) => {
    const dir = path.join(STORE, "samples", `${id}-${model}`);

    mkdirSync(dir, { recursive: true });

    await runJobs([...SAMPLE.entries()], 1, async ([i, text]) => {
      const file = path.join(
        dir,
        `${String(i + 1).padStart(2, "0")} ${text.replaceAll(/[?.,!]/gu, "")}.mp3`
      );

      if (!existsSync(file)) {
        writeFileSync(file, await record(id, text, model));
      }
    });

    console.log(`Samples in ${dir}`);
  });
};

const addVoice = (slug: string | undefined, id: string | undefined) => {
  if (slug === undefined || id === undefined) {
    throw new Error("Usage: bun scripts/build-audio.ts add <slug> <voice-id>");
  }

  if (!/^[a-z0-9-]{1,40}$/u.test(slug)) {
    throw new Error("The slug may use lower-case letters, digits and hyphens");
  }

  config.voices = [
    ...config.voices.filter((voice) => voice.slug !== slug),
    { slug, id, name: option("name") ?? slug },
  ];
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Voices: ${config.voices.map((voice) => voice.slug).join(", ")}`);
};

/** A text to record, with the name of its file. */
interface Recording {
  text: string;
  key: string;
}

const charactersOf = (recordings: Recording[]) =>
  recordings.reduce((n, r) => n + forSpeech(r.text).length, 0);

/** Records what one voice is missing, then uploads what the audio server does not have. */
const buildVoice = async (
  voice: Voice,
  recordings: Recording[],
  auth: { authorization: string }
) => {
  // The model is part of the local folder, so changing it records everything again.
  const local = (key: string) =>
    path.join(STORE, config.model, voice.slug, `${key}.mp3`);

  const toRecord = recordings.filter((r) => !existsSync(local(r.key)));

  console.log(
    `${voice.slug}: ${toRecord.length} to record (${charactersOf(toRecord)} characters)`
  );

  if (flag("dry")) {
    return;
  }

  let done = 0;

  // Two at a time: the smallest ElevenLabs plans allow three parallel requests.
  await runJobs(toRecord, 2, async (recording) => {
    const file = local(recording.key);

    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, await record(voice.id, recording.text, config.model));
    done += 1;

    if (done % 50 === 0) {
      console.log(`  recorded ${done} of ${toRecord.length}`);
    }
  });

  const listed = await fetch(`${SITE}/api/audio-list`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ voice: voice.slug }),
  });

  if (!listed.ok) {
    throw new Error(`The audio server answered ${listed.status}`);
  }

  const online = new Set(v.parse(AudioListSchema, await listed.json()));

  const toUpload = recordings.filter(
    (r) => !online.has(`${voice.slug}/${r.key}.mp3`)
  );

  console.log(`${voice.slug}: ${toUpload.length} to upload`);

  await runJobs(toUpload, 8, async (recording) => {
    const response = await fetch(
      `${SITE}/api/audio/${voice.slug}/${recording.key}.mp3`,
      {
        method: "PUT",
        headers: auth,
        body: readFileSync(local(recording.key)),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Upload failed with ${response.status} for "${recording.text}"`
      );
    }
  });
};

const build = async () => {
  if (config.voices.length === 0) {
    throw new Error(
      "No voices yet. Run: bun scripts/build-audio.ts add <slug> <voice-id>"
    );
  }

  const recordings = await Promise.all(
    texts().map(async (text) => ({ text, key: await audioKey(text) }))
  );

  console.log(
    `${recordings.length} texts, ${charactersOf(recordings)} characters per voice, model ${config.model}`
  );

  const syncKey = readFileSync(path.join(ROOT, ".sync-key"), "utf-8").trim();
  const auth = { authorization: `Bearer ${syncKey}` };

  // One voice after the other, so the limits on parallel requests hold.
  await runJobs(config.voices, 1, async (voice) => {
    await buildVoice(voice, recordings, auth);
  });

  if (flag("dry")) {
    return;
  }

  // Only now does the app start asking for recordings of these voices.
  writeFileSync(
    LIVE,
    `${JSON.stringify({ voices: config.voices.map((voice) => voice.slug) })}\n`
  );
  console.log(
    "Done. Commit src/audio.json and text/audio.json, then push to publish."
  );
};

const [command, ...rest] = process.argv
  .slice(2)
  .filter(
    (a) => !a.startsWith("--") && a !== option("model") && a !== option("name")
  );

if (command === "voices") {
  await listVoices();
} else if (command === "sample") {
  await sample(rest);
} else if (command === "add") {
  addVoice(rest[0], rest[1]);
} else if (command === "build") {
  await build();
} else {
  console.log(
    "Commands: voices | sample <voice-id>... [--model a,b] | add <slug> <voice-id> [--name N] | build [--dry]"
  );
}
