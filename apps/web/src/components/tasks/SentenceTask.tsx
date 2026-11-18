import { item } from "@norsk/content";
import type { Sentence } from "@norsk/content";
import { explainRequest, sentenceTask } from "@norsk/engine";
import type {
  SentenceEvent,
  SentenceHint,
  SentenceState,
  TaskResult,
} from "@norsk/engine";
import { Check, CircleAlert, X } from "lucide-react";
import { useState } from "react";

import { getState } from "../../engine/store";
import { useExplain } from "../../lib/explain";
import { AnswerInput } from "../AnswerInput";
import { DockRow, Focus } from "../Focus";
import { AudioButton, Button } from "../ui";
import { AiNote, Answer, Ask, Remark, Stamp, itemName } from "./shared";
import type { Frame } from "./shared";
import { useTask } from "./use-task";

/** A prompt that points at the problem without giving the answer. */
function hintText(hint: SentenceHint): string {
  switch (hint.kind) {
    case "order": {
      return hint.pattern
        ? `All the words are right. Check the order: ${item(hint.pattern).title}.`
        : "All the words are right. Check the order.";
    }

    case "extra": {
      return "There is a word too many.";
    }

    case "pattern": {
      return `Think about: ${item(hint.id).title}.`;
    }

    case "word": {
      return `Check the word for “${item(hint.id).gloss}”.`;
    }

    case "chunk": {
      return `Check the phrase for “${item(hint.id).gloss}”.`;
    }

    case "unknown": {
      return "One word is missing or wrong.";
    }
  }
}

interface Props {
  sentence: Sentence;
  frame: Frame;
  /** The line above the exchange. */
  stamp?: string;
  onDone: (result: TaskResult) => void;
}

/** A whole sentence: English shown, Norwegian typed. One sentence reviews every item in it. */
export function SentenceTask({
  sentence,
  frame,
  stamp = "Say it in Norwegian",
  onDone,
}: Props) {
  const [state, send] = useTask(
    sentenceTask,
    () => ({ sentence, known: new Set(getState().memory.keys()) }),
    onDone
  );

  return <SentenceView state={state} send={send} frame={frame} stamp={stamp} />;
}

interface ViewProps {
  state: SentenceState;
  send: (event: SentenceEvent) => void;
  frame: Frame;
  stamp: string;
}

/** Draws a sentence task. Also used for the practice sentences of a pattern, which run inside its machine. */
export function SentenceView({ state, send, frame, stamp }: ViewProps) {
  const [input, setInput] = useState("");
  const { sentence, covered, phase } = state;

  const check = () => {
    send({ type: "answer", text: input });
    setInput("");
  };

  const shown =
    phase.step === "retry"
      ? phase.first
      : phase.step === "result"
        ? phase.last
        : null;

  // The app has already decided right and wrong. The language model only adds words about the mistake.
  const ask = explainRequest(state);

  const aiText = useExplain(
    ask && {
      kind: ask.kind,
      en: ask.en,
      no: ask.no,
      answer: ask.answer,
      topics: ask.itemIds.map(itemName),
    }
  );

  return (
    <Focus
      {...frame}
      scrollKey={`${phase.step}-${aiText ? 1 : 0}`}
      dock={
        phase.step === "result" ? (
          <DockRow>
            {phase.failed.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  send({ type: "typo" });
                }}
              >
                It was a typo
              </Button>
            ) : (
              <span />
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
      <Stamp>{stamp}</Stamp>
      <Ask>{sentence.en}</Ask>

      {shown && (
        <div
          key={phase.step}
          className="rise flex flex-wrap justify-end gap-1.5 self-end lg:gap-2"
        >
          {shown.typed.map((w, i) => (
            <span
              key={i}
              className={`bg-inverse text-24 text-on-inverse lg:text-40 inline-flex h-[2.875rem] items-center gap-1.5 rounded-2xl pr-3 pl-4 font-medium tracking-[-0.02em] lg:h-[4.5rem] lg:gap-2.5 lg:rounded-3xl lg:pr-[1.375rem] lg:pl-[1.625rem] ${
                w.ok
                  ? ""
                  : "shadow-[inset_0_0_0_2px_var(--color-red)] lg:shadow-[inset_0_0_0_3px_var(--color-red)]"
              }`}
            >
              {w.word}
              {w.ok ? (
                <Check
                  className="text-green-ink size-4 lg:size-[1.375rem]"
                  aria-label="right"
                />
              ) : (
                <X
                  className="text-red-ink size-4 lg:size-[1.375rem]"
                  aria-label="wrong"
                />
              )}
            </span>
          ))}
        </div>
      )}

      {phase.step === "retry" && (
        <>
          <Remark
            className="mt-1 lg:mt-2.5"
            lead={phase.close ? "Almost." : "Not yet."}
          >
            {hintText(phase.hint)}
          </Remark>
          {aiText && <AiNote label="Hint">{aiText}</AiNote>}
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
        <>
          <Answer
            audio={
              <AudioButton
                text={sentence.no}
                className="size-12 lg:size-[3.75rem]"
              />
            }
            good={phase.passed}
            note={
              phase.failed.length === 0
                ? "Correct."
                : phase.passed
                  ? "Correct on the second try."
                  : "This is the answer."
            }
          >
            {sentence.no}
          </Answer>
          {aiText && <AiNote label="Explanation">{aiText}</AiNote>}
          {covered.length > 0 && (
            <div className="rise border-line bg-inset flex flex-col self-stretch rounded-[1.25rem] border px-4 py-3.5 lg:rounded-[1.625rem] lg:px-7 lg:py-[1.375rem]">
              <div className="flex justify-between gap-3 pb-2 lg:pb-3">
                <span className="text-15 lg:text-18 font-medium">
                  This sentence reviews {covered.length}{" "}
                  {covered.length === 1 ? "item" : "items"}
                </span>
                {phase.failed.length > 0 && (
                  <span className="text-14 text-fg2 lg:text-16 shrink-0">
                    {covered.filter((id) => phase.failed.includes(id)).length}{" "}
                    to repeat
                  </span>
                )}
              </div>
              {covered.map((id) => {
                const bad = phase.failed.includes(id);

                return (
                  <div
                    key={id}
                    className="border-line text-15 lg:text-18 flex items-center gap-3 border-t py-2 lg:py-[0.6875rem]"
                  >
                    {bad ? (
                      <CircleAlert className="text-red size-[1.125rem] shrink-0" />
                    ) : (
                      <Check className="text-green size-[1.125rem] shrink-0" />
                    )}
                    <span className="flex-1">{itemName(id)}</span>
                    <span className="text-14 text-fg2">
                      {bad ? "needs work" : "reviewed"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </Focus>
  );
}
