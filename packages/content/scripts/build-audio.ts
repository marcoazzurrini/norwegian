// Records every Norwegian text of the curriculum with ElevenLabs and uploads the files to R2.
//
//   bun scripts/build-audio.ts voices                 list Norwegian voices in the ElevenLabs library
//   bun scripts/build-audio.ts sample <voice-id>...   record a few texts per voice into data/audio/samples
//   bun scripts/build-audio.ts add <slug> <voice-id>  add a voice to content/audio.json
//   bun scripts/build-audio.ts build [--dry]          record what is missing, upload it, switch the app over
//
// Needs ELEVENLABS_API_KEY in .env. Uploading needs the sync key in .sync-key.
// Recordings are kept in data/audio (not in git), so nothing is ever paid for twice.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { audioKey, spokenText } from "../src/audio-key";
import curriculum from "../src/curriculum.json";
import type { Curriculum } from "../src/types";

const ROOT = join(import.meta.dir, "..");
const CONFIG = join(ROOT, "text/audio.json");
const LIVE = join(ROOT, "src/audio.json");
const STORE = join(ROOT, "data/audio");
const SITE = process.env.SITE ?? "https://norwegian.marcoazzurrini.com";
const API = "https://api.elevenlabs.io";

interface Voice {
  /** Folder name in R2: lower-case letters, digits and hyphens. */
  slug: string;
  id: string;
  name: string;
}

interface Config {
  model: string;
  voices: Voice[];
}

const config = JSON.parse(readFileSync(CONFIG, "utf-8")) as Config;
const flag = (name: string) => process.argv.includes(`--${name}`);

const option = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);

  return i > 0 ? process.argv[i + 1] : undefined;
};

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;

  if (!key) {
    throw new Error("Set ELEVENLABS_API_KEY in .env");
  }

  return key;
}

/** Every text the app can speak. */
function texts(): string[] {
  const c = curriculum as unknown as Curriculum;
  const all = new Set<string>();

  const add = (t: string | undefined) => {
    const s = t && spokenText(t);

    if (s) {
      all.add(s);
    }
  };

  for (const it of Object.values(c.items)) {
    if (it.kind !== "pattern") {
      add(it.text);
    }

    for (const ex of it.examples ?? []) {
      add(ex.no.split(">").pop());
    }

    for (const q of it.quiz ?? []) {
      add(q.prompt);
    }
  }

  for (const s of Object.values(c.sentences)) {
    add(s.no);
  }

  for (const st of Object.values(c.stories)) {
    for (const line of st.lines) {
      add(line.no);
    }

    for (const word of Object.keys(st.glosses)) {
      add(word);
    }
  }

  for (const p of c.sounds) {
    add(p.a.word);
    add(p.b.word);
  }

  return [...all];
}

/** A lone word needs its full stop: without it the voice can trail off or sound like a question. */
const forSpeech = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

async function record(
  voiceId: string,
  text: string,
  model: string
): Promise<Buffer> {
  const headers = {
    "xi-api-key": apiKey(),
    "content-type": "application/json",
  };

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

  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    }

    const detail = (await response.text()).slice(0, 400);

    // Too many requests or a server fault: wait and try again. Anything else will not fix itself.
    if ((response.status === 429 || response.status >= 500) && attempt < 8) {
      await Bun.sleep(attempt * 3000);
      continue;
    }

    throw new Error(
      `ElevenLabs answered ${response.status} for "${text}": ${detail}`
    );
  }
}

async function listVoices() {
  const found = new Map<string, Record<string, string>>();

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

  for (const base of ["language=no", "search=norwegian", "search=norsk"]) {
    for (const filter of filters) {
      for (const sort of sorts) {
        const response = await fetch(
          `${API}/v1/shared-voices?page_size=3&${[base, filter, sort].filter(Boolean).join("&")}`
        );

        if (!response.ok) {
          continue;
        }

        const { voices } = (await response.json()) as {
          voices: Record<string, string>[];
        };

        for (const v of voices) {
          found.set(v.voice_id, v);
        }
      }
    }
  }

  for (const v of found.values()) {
    console.log(
      [
        v.voice_id,
        v.name,
        v.gender,
        v.age,
        v.accent,
        v.language,
        v.locale,
        v.category,
        `uses:${v.usage_character_count_1y}`,
        `clones:${v.cloned_by_count}`,
        `free:${v.free_users_allowed}`,
        `owner:${v.public_owner_id}`,
      ].join(" | ")
    );
    console.log(`    ${v.description?.slice(0, 160) ?? ""}`);
    console.log(`    ${v.preview_url ?? ""}`);
  }

  console.log(`${found.size} voices`);
}

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

async function sample(voiceIds: string[]) {
  const models = (option("model") ?? config.model).split(",");

  for (const id of voiceIds) {
    for (const model of models) {
      const dir = join(STORE, "samples", `${id}-${model}`);
      mkdirSync(dir, { recursive: true });

      for (const [i, text] of SAMPLE.entries()) {
        const file = join(
          dir,
          `${String(i + 1).padStart(2, "0")} ${text.replaceAll(/[?.,!]/g, "")}.mp3`
        );

        if (!existsSync(file)) {
          writeFileSync(file, await record(id, text, model));
        }
      }

      console.log(`Samples in ${dir}`);
    }
  }
}

function addVoice(slug: string, id: string) {
  if (!/^[a-z0-9-]{1,40}$/.test(slug)) {
    throw new Error("The slug may use lower-case letters, digits and hyphens");
  }

  config.voices = [
    ...config.voices.filter((v) => v.slug !== slug),
    { slug, id, name: option("name") ?? slug },
  ];
  writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Voices: ${config.voices.map((v) => v.slug).join(", ")}`);
}

async function build() {
  if (!config.voices.length) {
    throw new Error(
      "No voices yet. Run: bun scripts/build-audio.ts add <slug> <voice-id>"
    );
  }

  const all = texts();
  const chars = all.reduce((n, t) => n + forSpeech(t).length, 0);
  console.log(
    `${all.length} texts, ${chars} characters per voice, model ${config.model}`
  );

  const syncKey = readFileSync(join(ROOT, ".sync-key"), "utf-8").trim();
  const auth = { authorization: `Bearer ${syncKey}` };

  for (const voice of config.voices) {
    // The model is part of the local folder, so changing it records everything again.
    const local = (key: string) =>
      join(STORE, config.model, voice.slug, `${key}.mp3`);

    const jobs = await Promise.all(
      all.map(async (text) => ({ text, key: await audioKey(text) }))
    );

    const toRecord = jobs.filter((j) => !existsSync(local(j.key)));
    console.log(
      `${voice.slug}: ${toRecord.length} to record (${toRecord.reduce((n, j) => n + forSpeech(j.text).length, 0)} characters)`
    );

    if (flag("dry")) {
      continue;
    }

    let done = 0;
    const queue = [...toRecord];
    // Two at a time: the smallest ElevenLabs plans allow three parallel requests.
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const file = local(job.key);
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, await record(voice.id, job.text, config.model));

          if (++done % 50 === 0) {
            console.log(`  recorded ${done} of ${toRecord.length}`);
          }
        }
      })
    );

    const listed = await fetch(`${SITE}/api/audio-list`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ voice: voice.slug }),
    });

    if (!listed.ok) {
      throw new Error(`The audio server answered ${listed.status}`);
    }

    const online = new Set((await listed.json()) as string[]);

    const toUpload = jobs.filter(
      (j) => !online.has(`${voice.slug}/${j.key}.mp3`)
    );

    console.log(`${voice.slug}: ${toUpload.length} to upload`);
    const uploads = [...toUpload];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let job = uploads.shift(); job; job = uploads.shift()) {
          const response = await fetch(
            `${SITE}/api/audio/${voice.slug}/${job.key}.mp3`,
            { method: "PUT", headers: auth, body: readFileSync(local(job.key)) }
          );

          if (!response.ok) {
            throw new Error(
              `Upload failed with ${response.status} for "${job.text}"`
            );
          }
        }
      })
    );
  }

  if (flag("dry")) {
    return;
  }

  // Only now does the app start asking for recordings of these voices.
  writeFileSync(
    LIVE,
    `${JSON.stringify({ voices: config.voices.map((v) => v.slug) })}\n`
  );
  console.log(
    `Done. Commit src/content/audio.json and content/audio.json, then push to publish.`
  );
}

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
