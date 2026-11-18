import type { Item } from "@norsk/content";
import { cardTask } from "@norsk/engine";
import type { CardHint, TaskResult } from "@norsk/engine";
import { useState } from "react";

import { AnswerInput } from "../AnswerInput";
import { DockRow, Focus } from "../Focus";
import { AudioButton, Button, Display } from "../ui";
import { Answer, Ask, Mine, Remark, Stamp, hasArticle } from "./shared";
import type { Frame } from "./shared";
import { useTask } from "./use-task";

/** What the learner is asked to type, in words. */
export function cueKind(it: Item): string {
  if (it.kind === "chunk") {
    return "Phrase";
  }

  if (it.pos === "noun" && it.gender && it.gender !== "pl") {
    return "Noun, with en, ei or et";
  }

  if (it.pos === "verb") {
    return "Verb";
  }

  return "Word";
}

/** A prompt that points at the problem without giving the answer. */
export function cardHint(it: Item, hint: CardHint): string {
  if (hint === "article") {
    return "The word is right. Is it an en, ei or et word?";
  }

  const first = it.text.replaceAll("_", "").trim();

  return `It starts with “${first.slice(0, it.kind === "chunk" ? 3 : 1)}…”.`;
}

interface Props {
  item: Item;
  frame: Frame;
  onDone: (result: TaskResult) => void;
}

/** A single item on its own: meaning shown, Norwegian typed. */
export function CardTask({ item, frame, onDone }: Props) {
  const [input, setInput] = useState("");
  const [state, send] = useTask(cardTask, () => ({ item }), onDone);
  const { phase, typed } = state;

  const check = () => {
    send({ type: "answer", text: input });
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
      {typed && <Mine>{typed}</Mine>}

      {phase.step === "retry" && (
        <>
          <Remark lead="Not yet.">{cardHint(item, phase.hint)}</Remark>
          <Button
            variant="outline"
            size="medium"
            className="rise self-start"
            onClick={() => {
              send({ type: "reveal" });
            }}
          >
            Show answer
          </Button>
        </>
      )}

      {phase.step === "result" && (
        <Answer
          audio={
            <AudioButton
              text={item.text}
              className="size-12 lg:size-[3.75rem]"
            />
          }
          good={phase.correct}
          note={
            phase.firstTry
              ? "Correct."
              : phase.correct
                ? "Correct on the second try. It will come back soon."
                : "This is the answer. It will come back soon."
          }
        >
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      )}
    </Focus>
  );
}
