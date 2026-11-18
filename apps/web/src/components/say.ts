import { speak } from "../speech";

/** Plays Norwegian audio without waiting for it to end. */
export const say = (words: string): void => {
  speak(words).catch(reportError);
};
