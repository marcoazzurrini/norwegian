// Playing audio in the language of a course.
//
// This module hides the recorded files and their hashed names, which recorded voice says a text
// on a given day, the browser's own voice as a fallback when there is no recording, how the speed
// setting applies to each, and that a new text stops the one before it.
//
// A caller makes one speech with `createSpeech`, handing it a way to read the learner's voice and
// speed, and then calls `speak` and `stopSpeaking`. The React hook is in `@norsk/speech/react`.
export { createSpeech } from "./speech";

export type {
  Player,
  SpeakOptions,
  Speech,
  SpeechDeps,
  SpeechHost,
  SpeechSettings,
  SpokenCourse,
  Synthesis,
  Utterance,
  Voice,
} from "./types";
