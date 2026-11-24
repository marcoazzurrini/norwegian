// The curriculum: what is taught, in which order, and the sentences, stories and sound pairs that practise it.
//
// This module hides the shape of the JSON file on disk, the indexes built over it for fast lookups,
// and how a recording of a text is named. Callers ask questions by id and get typed answers.
// A lookup with an id that does not exist is a programming mistake, so it throws.
import audio from "./audio.json";
// The .js is spelled out so every tool picks the same file: see curriculum-data.d.ts.
import data from "./curriculum-data.js";
import type { Item, Lesson, Level, Sentence, Story } from "./schema";

export const curriculum = data;

export const { levels, items, lessons, units, sentences, stories, sounds } =
  curriculum;

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

const levelByUnit = new Map(
  levels.flatMap((one) => one.units.map((unit) => [unit, one] as const))
);

/** The level a unit belongs to. */
export const levelOf = (unit: number): Level => {
  const found = levelByUnit.get(unit);

  if (found === undefined) {
    throw new Error(`Unit ${unit} is in no level`);
  }

  return found;
};

// The curriculum never changes while the app runs, so the lessons of a level are found once.
const lessonsByLevel = new Map(
  levels.map((one) => [
    one.id,
    lessons.filter((lesson) => one.units.includes(lesson.unit)),
  ])
);

/** The lessons of a level, in the order of the course. None for a level that is not written yet. */
export const levelLessons = (one: Level): readonly Lesson[] =>
  lessonsByLevel.get(one.id) ?? [];

/** The ids of every item taught in a level, in the order taught. */
export const levelItems = (one: Level): string[] =>
  levelLessons(one).flatMap((lesson) => lesson.items);

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

const sentenceById = new Map(sentences.map((s) => [s.id, s]));

/** The sentence that first shows a word or chunk in use, or null for an item that has none. */
export const exampleOf = (it: Item): Sentence | null => {
  if (it.exampleId === undefined) {
    return null;
  }

  const found = sentenceById.get(it.exampleId);

  if (found === undefined) {
    throw new Error(`Unknown sentence "${it.exampleId}"`);
  }

  return found;
};

export const storyById = (id: string): Story | undefined =>
  stories.find((s) => s.id === id);

/** Voices that have recordings, by their short name. */
export const recordedVoices: readonly string[] = audio.voices;

export { audioKey, audioPath, spokenText } from "./audio-key";

export { chunkCovered, sentenceReady } from "./ready";

export type { Known } from "./ready";

export { CurriculumSchema } from "./schema";

export type {
  Curriculum,
  Example,
  FormRow,
  Item,
  ItemKind,
  Lesson,
  Level,
  Quiz,
  Sentence,
  SoundPair,
  Story,
  StoryLine,
  Token,
  Unit,
} from "./schema";
