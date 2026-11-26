// A course: one language, with what is taught, in which order, and the sentences, stories and
// sound pairs that practise it.
//
// This module hides the indexes built over the curriculum for fast lookups. Callers ask
// questions by id and get typed answers. A lookup with an id that does not exist is a
// programming mistake, so it throws.
import type { CourseMeta } from "./meta";
import type {
  Curriculum,
  Item,
  Lesson,
  Level,
  Sentence,
  Story,
} from "./schema";

/** What a course is made from. */
export interface CourseParts {
  meta: CourseMeta;
  curriculum: Curriculum;
  /** Voices that have recordings, by their short name. */
  voices: readonly string[];
}

export interface Course extends Curriculum {
  readonly meta: CourseMeta;
  /** Voices that have recordings, by their short name. */
  readonly voices: readonly string[];
  item: (id: string) => Item;
  /** The level a unit belongs to. */
  levelOf: (unit: number) => Level;
  /** The lessons of a level, in the order of the course. None for a level that is not written yet. */
  levelLessons: (level: Level) => readonly Lesson[];
  /** The ids of every item taught in a level, in the order taught. */
  levelItems: (level: Level) => string[];
  /** The lesson that teaches this item. */
  lessonOf: (id: string) => Lesson;
  /** Lessons that list this lesson as a need. */
  unlockedBy: (index: number) => Lesson[];
  /** Every item a sentence can exercise: words, chunks and patterns. */
  sentenceItems: (sentence: Sentence) => readonly string[];
  /** Every sentence that exercises this item. */
  sentencesWith: (id: string) => Sentence[];
  /** The sentence that first shows a word or chunk in use, or null for an item that has none. */
  exampleOf: (item: Item) => Sentence | null;
  storyById: (id: string) => Story | undefined;
}

/** Every item a sentence can exercise: words, chunks and patterns. Worked out anew at each call. */
export const itemsOfSentence = (s: Sentence): string[] => {
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

export const createCourse = ({
  meta,
  curriculum,
  voices,
}: CourseParts): Course => {
  const { levels, items, lessons, sentences, stories } = curriculum;

  const itemById = new Map(Object.entries(items));

  const item = (id: string): Item => {
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

  // The curriculum never changes while the app runs, so the lessons of a level are found once.
  const lessonsByLevel = new Map(
    levels.map((one) => [
      one.id,
      lessons.filter((lesson) => one.units.includes(lesson.unit)),
    ])
  );

  const levelLessons = (one: Level): readonly Lesson[] =>
    lessonsByLevel.get(one.id) ?? [];

  // Choosing a review asks for the items of every sentence, so they are worked out once.
  const itemsBySentence = new Map<Sentence, readonly string[]>(
    sentences.map((s) => [s, itemsOfSentence(s)])
  );

  const sentenceItems = (s: Sentence): readonly string[] =>
    itemsBySentence.get(s) ?? itemsOfSentence(s);

  // Every item has an entry, so an id that is missing here is an unknown item, not an unused one.
  const bySentenceItem = new Map<string, Sentence[]>(
    Object.keys(items).map((id) => [id, []])
  );

  for (const s of sentences) {
    for (const id of sentenceItems(s)) {
      bySentenceItem.get(id)?.push(s);
    }
  }

  const sentenceById = new Map(sentences.map((s) => [s.id, s]));

  return {
    ...curriculum,

    exampleOf: (it) => {
      if (it.exampleId === undefined) {
        return null;
      }

      const found = sentenceById.get(it.exampleId);

      if (found === undefined) {
        throw new Error(`Unknown sentence "${it.exampleId}"`);
      }

      return found;
    },

    item,
    lessonOf: (id) => lessonAt(item(id).lesson),
    levelItems: (one) => levelLessons(one).flatMap((lesson) => lesson.items),
    levelLessons,

    levelOf: (unit) => {
      const found = levelByUnit.get(unit);

      if (found === undefined) {
        throw new Error(`Unit ${unit} is in no level`);
      }

      return found;
    },

    meta,
    sentenceItems,

    sentencesWith: (id) => {
      const found = bySentenceItem.get(id);

      if (found === undefined) {
        throw new Error(`Unknown item "${id}"`);
      }

      return found;
    },

    storyById: (id) => stories.find((s) => s.id === id),

    unlockedBy: (index) => {
      const lesson = lessonAt(index);

      return lessons.filter((l) => l.needs.includes(lesson.index));
    },

    voices,
  };
};
