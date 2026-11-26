// What the build knows about the curriculum while it is being put together.
import type { Item, Lesson, Quiz, Sentence, Story, Unit } from "@norsk/course";

import type { Forms } from "./forms";

/** Problems found in the text files. An error stops the build; a warning does not. */
export interface Report {
  errors: string[];
  warnings: string[];
}

/** An item, with what is needed to recognise it in a sentence. */
export interface ItemInfo {
  item: Item;
  /** Every spelling that counts as this item. Empty for chunks and patterns. */
  forms: Forms;
  /** Only the spelling as taught counts, not the other forms of the word. */
  exact: boolean;
  /** The dictionary form. Empty for chunks and patterns. */
  lemma: string;
  /** The name of this meaning, when the same word or phrase is taught once for each of its meanings. */
  sense: string | undefined;
  /** A word the author marked "no-example": the build does not ask for an example sentence. */
  noExample: boolean;
}

/** A sentence as written in a unit file, before its words are matched to items. */
export interface RawSentence {
  unit: number;
  no: string;
  en: string;
  /** Patterns the author added with +tag. */
  plus: string[];
  /** Patterns the author removed with -tag. */
  minus: string[];
  alts: string[];
  /** File and line, for messages. */
  where: string;
}

export interface RawStoryLine {
  who: string;
  no: string;
  en: string;
}

/** A story as written in a unit file. */
export interface RawStory {
  unit: number;
  title: string;
  titleEn: string;
  lines: RawStoryLine[];
  questions: Quiz[];
  glosses: Record<string, string>;
  where: string;
}

/** Everything read from the unit files. */
export interface Draft {
  units: Unit[];
  lessons: Lesson[];
  /** For each lesson, the needs as the author wrote them: pattern ids or lesson titles. */
  lessonNeeds: string[][];
  /** Every item by id, in the order taught. */
  info: Map<string, ItemInfo>;
  rawSentences: RawSentence[];
  rawStories: RawStory[];
}

/** The parts of the curriculum made from sentences and stories. */
export interface Practice {
  sentences: Sentence[];
  stories: Story[];
  /** item id -> the number of sentences that use it */
  usage: Map<string, number>;
}
