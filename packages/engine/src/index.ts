// The learning engine: what to study next, whether an answer is right, and what to remember about it.
//
// This module hides the FSRS scheduler and its library, the rules for credit when an item is recalled
// inside a sentence, how a typed answer is compared with the expected one, how a session spends its
// minutes, and the steps inside each kind of task.
//
// Everything here is pure. The caller passes in the time and the random numbers, and carries out the
// effects that the task machines return. Nothing reads a clock, storage, the network or the browser.

// Memory: one scheduled card per item.
export {
  applyReview,
  createScheduler,
  hasWaited,
  introduce,
  isDue,
  isStable,
  retrievability,
  review,
  strength,
} from "./memory";

export type { Card, Grade, Mem, ReviewInput, Scheduler } from "./memory";

// Selection: what is taught, what is due, and what comes next.
export {
  compression,
  currentLevel,
  dueItems,
  itemState,
  lessonState,
  levelState,
  nextLesson,
  nextNewItems,
  nextStory,
  pickRecall,
  pickReview,
  planRecalls,
  storyReady,
} from "./select";

export type {
  Compression,
  Due,
  ItemState,
  LessonState,
  LevelState,
  Memory,
  PickLimits,
  RecallPlan,
  ReviewPick,
  SentenceSeen,
} from "./select";

// Grading: comparing a typed answer with the expected one.
export { gradeCard, gradeSentence } from "./grade";

export type { CardGrade, SentenceGrade, TypedWord } from "./grade";

// Pace: how long the learner takes for each kind of work.
export { typicalMs, withTime } from "./pace";

export type { Pace, PaceKind } from "./pace";

// A study session: one task after another until the time is up.
export { Session, blockOf } from "./session";

export type {
  Block,
  Choice,
  SessionStats,
  SessionView,
  SoundStats,
  Task,
} from "./session";

// Task machines: the steps inside each kind of task.
export { cardTask } from "./tasks/card";

export type { CardEvent, CardHint, CardInput, CardState } from "./tasks/card";

export { introTask } from "./tasks/intro";

export type {
  IntroEvent,
  IntroHelp,
  IntroInput,
  IntroState,
} from "./tasks/intro";

export { patternTask } from "./tasks/pattern";

export type { PatternEvent, PatternInput, PatternState } from "./tasks/pattern";

export type { QuizState } from "./tasks/quiz";

export { explainRequest, sentenceTask } from "./tasks/sentence";

export type {
  ExplainRequest,
  SentenceEvent,
  SentenceHint,
  SentenceInput,
  SentenceState,
} from "./tasks/sentence";

export { soundTask } from "./tasks/sound";

export type { SoundEvent, SoundInput, SoundState } from "./tasks/sound";

export { storyTask } from "./tasks/story";

export type {
  StoryEvent,
  StoryInput,
  StoryState,
  WordMeaning,
} from "./tasks/story";

export { EMPTY_RESULT } from "./tasks/types";

export type { Effect, Step, TaskMachine, TaskResult } from "./tasks/types";
