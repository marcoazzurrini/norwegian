// The voice of the course that is open: audio in its language, at the speed and with the voice the learner chose.
import type { SpeakOptions, Voice } from "@norsk/speech";
import { useVoices as useVoicesOf } from "@norsk/speech/react";

import { openCourse } from "./course";

export const speak = async (
  text: string,
  options?: SpeakOptions
): Promise<void> => {
  await openCourse().speech.speak(text, options);
};

export const stopSpeaking = (): void => {
  openCourse().speech.stopSpeaking();
};

/** The voices of this browser that speak the language of the course. */
export const useVoices = (): readonly Voice[] =>
  useVoicesOf(openCourse().speech);
