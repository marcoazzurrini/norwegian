// Shape of the built curriculum (src/curriculum.json), and the types the rest of the app uses for it.
// scripts/build-content.ts checks the curriculum against this schema before it writes the file,
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
  no: v.string(),
  en: v.string(),
});

export type Example = v.InferOutput<typeof ExampleSchema>;

export const QuizSchema = v.strictObject({
  prompt: v.string(),
  /** The first option is the correct one. The app shuffles them. */
  options: v.array(v.string()),
});

export type Quiz = v.InferOutput<typeof QuizSchema>;

/** The article a noun takes. "pl" is a noun that only has a plural, such as "penger". */
export const GenderSchema = v.picklist(["en", "ei", "et", "pl"]);

export type Gender = v.InferOutput<typeof GenderSchema>;

export const ItemSchema = v.strictObject({
  id: v.string(),
  kind: ItemKindSchema,
  /** Index of the lesson that teaches this item. */
  lesson: IndexSchema,
  /** The Norwegian text as taught, for example "hus" or "ha det bra". */
  text: v.string(),
  /** How the item is shown when presented, for example "et hus" or "å snakke". */
  display: v.string(),
  /** The English meaning cue. */
  gloss: v.string(),
  /** Every typed answer that counts as correct on a direct card. A pattern has none. */
  answers: v.array(v.string()),
  pos: v.exactOptional(v.string()),
  gender: v.exactOptional(GenderSchema),
  ipa: v.exactOptional(v.string()),
  tone: v.exactOptional(v.picklist([1, 2])),
  forms: v.exactOptional(v.array(FormRowSchema)),
  /** Pattern only. */
  title: v.exactOptional(v.string()),
  rule: v.exactOptional(v.array(v.string())),
  examples: v.exactOptional(v.array(ExampleSchema)),
  quiz: v.exactOptional(v.array(QuizSchema)),
  needs: v.exactOptional(v.array(v.string())),
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
  no: v.string(),
  en: v.string(),
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
  name: v.string(),
  subtitle: v.string(),
  lessons: v.array(IndexSchema),
});

export type Unit = v.InferOutput<typeof UnitSchema>;

export const StoryLineSchema = v.strictObject({
  who: v.string(),
  no: v.string(),
  en: v.string(),
  tokens: v.array(TokenSchema),
});

export type StoryLine = v.InferOutput<typeof StoryLineSchema>;

export const StorySchema = v.strictObject({
  id: v.string(),
  unit: IndexSchema,
  title: v.string(),
  titleEn: v.string(),
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
  units: v.array(UnitSchema),
  lessons: v.array(LessonSchema),
  items: v.record(v.string(), ItemSchema),
  sentences: v.array(SentenceSchema),
  stories: v.array(StorySchema),
  sounds: v.array(SoundPairSchema),
});

export type Curriculum = v.InferOutput<typeof CurriculumSchema>;
