import type { Item } from "@norsk/content";
import { cardTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import {
  Answer,
  AnswerInput,
  Ask,
  AudioButton,
  Button,
  Display,
  DockRow,
  Focus,
  Mine,
  Remark,
  Stamp,
  effects,
} from "@norsk/ui";
import { useState } from "react";

import { say } from "../say";
import { cardHint, cardNote, cueKind } from "./card-text";
import type { Frame } from "./frame";
import { hasArticle } from "./items";
import { taskStyles } from "./task-styles";
import { useTask } from "./use-task";

interface CardTaskProps {
  item: Item;
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** A single item on its own: meaning shown, Norwegian typed. */
export const CardTask = ({ item, frame, onDone }: CardTaskProps) => {
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
            {phase.firstTry ? (
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
          <AnswerInput
            key={phase.step}
            value={input}
            onChange={setInput}
            onSubmit={check}
            placeholder={
              phase.step === "retry" ? "Try again" : "Type in Norwegian"
            }
          />
        )
      }
    >
      <Stamp>Review</Stamp>
      <Ask note={`${cueKind(item)}. Type it in Norwegian.`}>{item.gloss}</Ask>
      {typed === "" ? null : <Mine>{typed}</Mine>}

      {phase.step === "retry" ? (
        <>
          <Remark lead="Not yet.">{cardHint(item, phase.hint)}</Remark>
          <Button
            variant="outline"
            size="medium"
            style={[effects.rise, taskStyles.showAnswer]}
            onClick={() => {
              send({ type: "reveal" });
            }}
          >
            Show answer
          </Button>
        </>
      ) : null}

      {phase.step === "result" ? (
        <Answer
          audio={
            <AudioButton
              onPlay={() => {
                say(item.text);
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
