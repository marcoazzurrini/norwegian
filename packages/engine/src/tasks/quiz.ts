// Multiple choice, shared by the pattern and story machines.
// A wrong pick is marked and the learner tries again; nothing is recorded.
import type { Quiz } from "@norsk/course";

export interface QuizState {
  /** Position of the question in its list. */
  index: number;
  question: Quiz;
  /** The wrong options picked so far. */
  wrong: string[];
  /** The right option was picked; the next question follows after a short pause. */
  answered: boolean;
}

/** The question at `index`, or null when the list has no such question. */
export const askQuestion = (
  questions: Quiz[],
  index: number
): QuizState | null => {
  const question = questions[index];

  return question === undefined
    ? null
    : { answered: false, index, question, wrong: [] };
};

export const pickOption = (quiz: QuizState, option: string): QuizState => {
  if (quiz.answered || quiz.wrong.includes(option)) {
    return quiz;
  }

  // The first option in the curriculum is the correct one.
  return option === quiz.question.options[0]
    ? { ...quiz, answered: true }
    : { ...quiz, wrong: [...quiz.wrong, option] };
};
