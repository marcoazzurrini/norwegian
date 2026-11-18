// Shape of the built curriculum (src/content/curriculum.json).
// The build script scripts/build-content.ts produces it from the files in content/.

export type ItemKind = "word" | "chunk" | "pattern";

export interface FormRow {
  label: string;
  form: string;
}

export interface Example {
  no: string;
  en: string;
}

export interface Quiz {
  prompt: string;
  /** The first option is the correct one. The app shuffles them. */
  options: string[];
}

export interface Item {
  id: string;
  kind: ItemKind;
  /** Index of the lesson that teaches this item. */
  lesson: number;
  /** The Norwegian text as taught, for example "hus" or "ha det bra". */
  text: string;
  /** How the item is shown when presented, for example "et hus" or "å snakke". */
  display: string;
  /** The English meaning cue. */
  gloss: string;
  /** Every typed answer that counts as correct on a direct card. */
  answers: string[];
  pos?: string;
  gender?: "en" | "ei" | "et" | "pl";
  ipa?: string;
  tone?: 1 | 2;
  forms?: FormRow[];
  /** Pattern only. */
  title?: string;
  rule?: string[];
  examples?: Example[];
  quiz?: Quiz[];
  needs?: string[];
}

export interface Token {
  /** The word as written in the sentence, without punctuation. */
  t: string;
  /** Word item this token belongs to. */
  w?: string;
  /** Chunk item that covers this token. */
  c?: string;
  /** Patterns this token exercises. */
  p?: string[];
  /** Other spellings that count as correct here. */
  alts?: string[];
  /** A name, not an item. */
  free?: boolean;
}

export interface Sentence {
  id: string;
  unit: number;
  no: string;
  en: string;
  tokens: Token[];
  /** Patterns of the sentence as a whole, such as word order. */
  patterns: string[];
  alts: string[];
}

export interface Lesson {
  index: number;
  unit: number;
  title: string;
  items: string[];
  /** Lessons that must be finished first. */
  needs: number[];
}

export interface Unit {
  index: number;
  name: string;
  subtitle: string;
  lessons: number[];
}

export interface StoryLine {
  who: string;
  no: string;
  en: string;
  tokens: Token[];
}

export interface Story {
  id: string;
  unit: number;
  title: string;
  titleEn: string;
  lines: StoryLine[];
  questions: Quiz[];
  /** Words in the story that are not taught items, with their meaning. */
  glosses: Record<string, string>;
}

export interface SoundPair {
  id: string;
  group: string;
  groupTitle: string;
  hint: string;
  a: { word: string; gloss: string };
  b: { word: string; gloss: string };
}

export interface Curriculum {
  units: Unit[];
  lessons: Lesson[];
  items: Record<string, Item>;
  sentences: Sentence[];
  stories: Story[];
  sounds: SoundPair[];
}
