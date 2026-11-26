// The field the learner types an answer in, told about the language of the course.
import { AnswerInput } from "@norsk/ui";

import { useCourse } from "../../course";

interface AnswerFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter or the send button, and only when there is something to send. */
  onSubmit: () => void;
  /** What the empty field says. Without it, the field asks for the language of the course. */
  placeholder?: string;
}

export const AnswerField = ({ placeholder, ...rest }: AnswerFieldProps) => {
  const { meta } = useCourse();

  return (
    <AnswerInput
      {...rest}
      placeholder={placeholder ?? `Type in ${meta.name}`}
      lang={meta.lang}
      letters={meta.letters}
    />
  );
};
