// The words around a sentence task: the hint after a miss and the line under the answer.
import type { Course } from "@norsk/course";
import type { SentenceHint } from "@norsk/engine";

/** A prompt that points at the problem without giving the answer. */
export const hintText = (course: Course, hint: SentenceHint): string => {
  switch (hint.kind) {
    case "order": {
      return hint.pattern === null
        ? "All the words are right. Check the order."
        : `All the words are right. Check the order: ${course.item(hint.pattern).title ?? ""}.`;
    }

    case "extra": {
      return "There is a word too many.";
    }

    case "pattern": {
      return `Think about: ${course.item(hint.id).title ?? ""}.`;
    }

    case "word": {
      return `Check the word for “${course.item(hint.id).gloss}”.`;
    }

    case "chunk": {
      return `Check the phrase for “${course.item(hint.id).gloss}”.`;
    }

    case "unknown": {
      return "One word is missing or wrong.";
    }

    default: {
      throw new Error(`Unknown hint: ${JSON.stringify(hint satisfies never)}`);
    }
  }
};

/** The line under the answer of a sentence. `failed` is how many items must be repeated. */
export const sentenceNote = (failed: number, passed: boolean): string => {
  if (failed === 0) {
    return "Correct.";
  }

  return passed ? "Correct on the second try." : "This is the answer.";
};
