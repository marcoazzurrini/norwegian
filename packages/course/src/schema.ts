// Shape of the curriculum of a course, and the types the rest of the app uses for it.
// The same shape serves every language: a text is either in the language of the course ("target")
// or in the language the learner reads explanations in ("base").
// A course checks its curriculum against this schema when it is built,
// so the app can trust the file and does not check it again when it starts.
import * as v from "valibot";

/** A whole number from zero up: the number of a lesson or a unit. */
const IndexSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

export const ItemKindSchema = v.picklist(["word", "chunk", "pattern"]);

export type ItemKind = v.InferOutput<typeof ItemKindSchema>;

export const FormRowSchema = v.strictObject({
  label: v.string(),
  form: v.string(),
});

export type FormRow = v.InferOutput<typeof FormRowSchema>;

export const ExampleSchema = v.strictObject({
  /** The example in the language of the course. */
  target: v.string(),
  /** Its meaning in the learner's language. */
  base: v.string(),
});

export type Example = v.InferOutput<typeof ExampleSchema>;

export const QuizSchema = v.strictObject({
  prompt: v.string(),
  /** The first option is the correct one. The app shuffles them. */
  options: v.array(v.string()),
});

export type Quiz = v.InferOutput<typeof QuizSchema>;

export const ItemSchema = v.strictObject({
  id: v.string(),
  kind: ItemKindSchema,
  /** Index of the lesson that teaches this item. */
  lesson: IndexSchema,
  /** The text as taught, in the language of the course, for example "hus" or "ha det bra". */
  text: v.string(),
  /** How the item is shown when presented, for example "et hus" or "å snakke". */
  display: v.string(),
  /** The meaning cue, in the learner's language. */
  gloss: v.string(),
  /** Every typed answer that counts as correct on a direct card. A pattern has none. */
  answers: v.array(v.string()),
  pos: v.exactOptional(v.string()),
  /** Noun only: the article it is learned with, such as "et". A noun without one has none. */
  article: v.exactOptional(v.string()),
  /** Noun only: it has no singular, such as "penger". */
  pluralOnly: v.exactOptional(v.literal(true)),
  ipa: v.exactOptional(v.string()),
  /** The melody of the word, in a language where a word has one. The course names its melodies. */
  tone: v.exactOptional(v.number()),
  forms: v.exactOptional(v.array(FormRowSchema)),
  /** Pattern only. */
  title: v.exactOptional(v.string()),
  rule: v.exactOptional(v.array(v.string())),
  examples: v.exactOptional(v.array(ExampleSchema)),
  quiz: v.exactOptional(v.array(QuizSchema)),
  needs: v.exactOptional(v.array(v.string())),
  /**
   * Word or chunk only: the id of the sentence that first shows the item in use.
   * The build chooses it, see scripts/lib/examples.ts. An item without one has no fitting sentence.
   */
  exampleId: v.exactOptional(v.string()),
});

export type Item = v.InferOutput<typeof ItemSchema>;

export const TokenSchema = v.strictObject({
  /** The word as written in the sentence, without punctuation. */
  t: v.string(),
  /** Word item this token belongs to. */
  w: v.exactOptional(v.string()),
  /** Chunk item that covers this token. */
  c: v.exactOptional(v.string()),
  /** Patterns this token exercises. */
  p: v.exactOptional(v.array(v.string())),
  /** Other spellings that count as correct here. */
  alts: v.exactOptional(v.array(v.string())),
  /** A name, not an item. */
  free: v.exactOptional(v.boolean()),
});

export type Token = v.InferOutput<typeof TokenSchema>;

export const SentenceSchema = v.strictObject({
  id: v.string(),
  unit: IndexSchema,
  /** The sentence in the language of the course. */
  target: v.string(),
  /** Its meaning in the learner's language. */
  base: v.string(),
  tokens: v.array(TokenSchema),
  /** Patterns of the sentence as a whole, such as word order. */
  patterns: v.array(v.string()),
  alts: v.array(v.string()),
});

export type Sentence = v.InferOutput<typeof SentenceSchema>;

export const LessonSchema = v.strictObject({
  index: IndexSchema,
  unit: IndexSchema,
  title: v.string(),
  items: v.array(v.string()),
  /** Lessons that must be finished first. */
  needs: v.array(IndexSchema),
});

export type Lesson = v.InferOutput<typeof LessonSchema>;

export const UnitSchema = v.strictObject({
  index: IndexSchema,
  /** The id of the level this unit belongs to, such as "A1". */
  level: v.string(),
  name: v.string(),
  subtitle: v.string(),
  lessons: v.array(IndexSchema),
});

export type Unit = v.InferOutput<typeof UnitSchema>;

/** A step of the course, such as A1. Levels are learned in the order they are listed. */
export const LevelSchema = v.strictObject({
  /** The name of the level in the European framework, such as "A1". */
  id: v.string(),
  /** What the level is called in plain words, such as "Beginner". */
  name: v.string(),
  /** The units of the level, in order. Empty for a level that is not written yet. */
  units: v.array(IndexSchema),
});

export type Level = v.InferOutput<typeof LevelSchema>;

export const StoryLineSchema = v.strictObject({
  who: v.string(),
  target: v.string(),
  base: v.string(),
  tokens: v.array(TokenSchema),
});

export type StoryLine = v.InferOutput<typeof StoryLineSchema>;

export const StorySchema = v.strictObject({
  id: v.string(),
  unit: IndexSchema,
  title: v.string(),
  /** The title in the learner's language. */
  titleBase: v.string(),
  lines: v.array(StoryLineSchema),
  questions: v.array(QuizSchema),
  /** Words in the story that are not taught items, with their meaning. */
  glosses: v.record(v.string(), v.string()),
});

export type Story = v.InferOutput<typeof StorySchema>;

const SoundWordSchema = v.strictObject({
  word: v.string(),
  gloss: v.string(),
});

export const SoundPairSchema = v.strictObject({
  id: v.string(),
  group: v.string(),
  groupTitle: v.string(),
  hint: v.string(),
  a: SoundWordSchema,
  b: SoundWordSchema,
});

export type SoundPair = v.InferOutput<typeof SoundPairSchema>;

export const CurriculumSchema = v.strictObject({
  levels: v.array(LevelSchema),
  units: v.array(UnitSchema),
  lessons: v.array(LessonSchema),
  items: v.record(v.string(), ItemSchema),
  sentences: v.array(SentenceSchema),
  stories: v.array(StorySchema),
  sounds: v.array(SoundPairSchema),
});

export type Curriculum = v.InferOutput<typeof CurriculumSchema>;
