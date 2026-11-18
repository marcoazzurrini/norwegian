// A multiple-choice question of a task: the options in a random order, drawn by the design system.
import type { QuizState } from "@norsk/engine";
import { Choices } from "@norsk/ui";
import { useMemo } from "react";

import { shuffled } from "./items";

interface QuizChoicesProps {
  /** The question and what has been picked so far, from the task machine. */
  quiz: QuizState;
  onPick: (option: string) => void;
  /** Called a moment after the right option was picked. */
  onNext: () => void;
}

/** The order of the options is drawn once for each question. */
export const QuizChoices = ({ quiz, onPick, onNext }: QuizChoicesProps) => {
  const { question } = quiz;

  const options = useMemo(
    () => shuffled(question.options, Math.random),
    [question]
  );

  // The first option in the curriculum is the correct one.
  const [answer = ""] = question.options;

  return (
    <Choices
      options={options}
      answer={answer}
      wrong={quiz.wrong}
      answered={quiz.answered}
      onPick={onPick}
      onNext={onNext}
    />
  );
};
