// What a course is, for the app and for the courses themselves.
//
// The app is a platform: it schedules, asks, grades and remembers, and knows nothing of any one
// language. A course is a package that hands the app a `Course`, made with `createCourse` from
// its curriculum and from a short description of what is particular to its language.
export { createCourse, itemsOfSentence } from "./course";

export type { Course, CourseParts } from "./course";

export type { CourseMeta, Greetings, Letter, Tutor } from "./meta";

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
