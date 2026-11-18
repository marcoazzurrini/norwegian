// The curriculum: what is taught, in which order, and the sentences, stories and sound pairs that practise it.
//
// This module hides the shape of the JSON file on disk, the indexes built over it for fast lookups,
// and how a recording of a text is named. Callers ask questions by id and get typed answers.
// A lookup with an id that does not exist is a programming mistake, so it throws.
import audio from "./audio.json";
// The .js is spelled out so every tool picks the same file: see curriculum-data.d.ts.
import data from "./curriculum-data.js";
import type { Item, Lesson, Sentence, Story } from "./schema";

export const curriculum = data;

export const { items, lessons, units, sentences, stories, sounds } = curriculum;

const itemById = new Map(Object.entries(items));

export const item = (id: string): Item => {
  const found = itemById.get(id);

  if (found === undefined) {
    throw new Error(`Unknown item "${id}"`);
  }

  return found;
};

const lessonAt = (index: number): Lesson => {
  const found = lessons[index];

  if (found === undefined) {
    throw new Error(`Unknown lesson ${index}`);
  }

  return found;
};

/** The lesson that teaches this item. */
export const lessonOf = (id: string): Lesson => lessonAt(item(id).lesson);

/** Lessons that list this lesson as a need. */
export const unlockedBy = (index: number): Lesson[] => {
  const lesson = lessonAt(index);

  return lessons.filter((l) => l.needs.includes(lesson.index));
};

const itemsIn = (s: Sentence): string[] => {
  const out = new Set<string>(s.patterns);

  for (const t of s.tokens) {
    if (t.w !== undefined) {
      out.add(t.w);
    }

    if (t.c !== undefined) {
      out.add(t.c);
    }

    for (const p of t.p ?? []) {
      out.add(p);
    }
  }

  return [...out];
};

// The curriculum never changes while the app runs, and choosing a review asks for
// the items of every sentence, so they are worked out once.
const itemsBySentence = new Map<Sentence, readonly string[]>(
  sentences.map((s) => [s, itemsIn(s)])
);

/** Every item a sentence can exercise: words, chunks and patterns. */
export const sentenceItems = (s: Sentence): readonly string[] =>
  itemsBySentence.get(s) ?? itemsIn(s);

// Every item has an entry, so an id that is missing here is an unknown item, not an unused one.
const bySentenceItem = new Map<string, Sentence[]>(
  Object.keys(items).map((id) => [id, []])
);

for (const s of sentences) {
  for (const id of sentenceItems(s)) {
    bySentenceItem.get(id)?.push(s);
  }
}

/** Every sentence that exercises this item. */
export const sentencesWith = (id: string): Sentence[] => {
  const found = bySentenceItem.get(id);

  if (found === undefined) {
    throw new Error(`Unknown item "${id}"`);
  }

  return found;
};

export const storyById = (id: string): Story | undefined =>
  stories.find((s) => s.id === id);

/** Voices that have recordings, by their short name. */
export const recordedVoices: readonly string[] = audio.voices;

export { audioKey, audioPath, spokenText } from "./audio-key";

export { CurriculumSchema } from "./schema";

export type {
  Curriculum,
  Example,
  FormRow,
  Item,
  ItemKind,
  Lesson,
  Quiz,
  Sentence,
  SoundPair,
  Story,
  StoryLine,
  Token,
  Unit,
} from "./schema";
