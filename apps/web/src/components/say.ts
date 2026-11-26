import { speak } from "../speech";

/** Plays audio in the language of the course without waiting for it to end. */
export const say = (words: string): void => {
  speak(words).catch(reportError);
};
