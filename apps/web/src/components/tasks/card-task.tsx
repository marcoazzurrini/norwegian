import type { Item } from "@norsk/course";
import { cardTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import {
  Answer,
  Ask,
  AudioButton,
  Button,
  Display,
  DockRow,
  Focus,
  Mine,
  Remark,
  Stamp,
} from "@norsk/ui";
import { useState } from "react";

import { useCourse } from "../../course";
import { say } from "../say";
import { AnswerField } from "./answer-field";
import { cardHint, cardNote, cueKind } from "./card-text";
import type { Frame } from "./frame";
import { CopyOnce, HelpButtons } from "./help";
import { hasArticle } from "./items";
import { taskStyles } from "./task-styles";
import { useTask } from "./use-task";

/** What the field asks for at each step that has one. */
const PLACEHOLDER = {
  // The field itself asks for the language of the course.
  ask: undefined,
  copy: "Copy it once",
  result: "",
  retry: "Try again",
} as const;

interface CardTaskProps {
  item: Item;
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** A single item on its own: its meaning shown, the item typed. */
export const CardTask = ({ item, frame, onDone }: CardTaskProps) => {
  const { meta } = useCourse();
  const [input, setInput] = useState("");
  const [state, send] = useTask(cardTask, () => ({ item }), onDone);
  const { phase, typed } = state;

  const check = () => {
    send({ text: input, type: "answer" });
    setInput("");
  };

  return (
    <Focus
      {...frame}
      scrollKey={phase.step}
      dock={
        phase.step === "result" ? (
          <DockRow>
            {phase.firstTry || !phase.answered ? (
              <span />
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  send({ type: "typo" });
                }}
              >
                It was a typo
              </Button>
            )}
            <Button
              key="continue"
              autoFocus
              onClick={() => {
                send({ type: "continue" });
              }}
              hint="↵"
            >
              Continue
            </Button>
          </DockRow>
        ) : (
          <AnswerField
            key={phase.step}
            value={input}
            onChange={setInput}
            onSubmit={check}
            {...(phase.step === "ask"
              ? {}
              : { placeholder: PLACEHOLDER[phase.step] })}
          />
        )
      }
    >
      <Stamp>Review</Stamp>
      <Ask note={`${cueKind(item, meta)}. Type it in ${meta.name}.`}>
        {item.gloss}
      </Ask>
      {typed === "" ? null : <Mine>{typed}</Mine>}

      {phase.step === "retry" ? (
        <Remark lead={typed === "" ? "Hint." : "Not yet."}>
          {cardHint(item, phase.hint, meta)}
        </Remark>
      ) : null}

      {phase.step === "ask" || phase.step === "retry" ? (
        <HelpButtons
          key={`help-${phase.step}`}
          onHint={
            phase.step === "ask"
              ? () => {
                  send({ type: "hint" });
                }
              : null
          }
          onReveal={() => {
            send({ type: "reveal" });
          }}
        />
      ) : null}

      {phase.step === "copy" ? <CopyOnce item={item} /> : null}

      {phase.step === "result" ? (
        <Answer
          audio={
            <AudioButton
              onPlay={() => {
                say(item.display);
              }}
              style={taskStyles.answerAudio}
            />
          }
          good={phase.correct}
          note={cardNote(phase.firstTry, phase.correct)}
        >
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      ) : null}
    </Focus>
  );
};
