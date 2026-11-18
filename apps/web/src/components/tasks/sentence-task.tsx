import type { Sentence } from "@norsk/content";
import { explainRequest, sentenceTask } from "@norsk/engine";
import type { SentenceEvent, SentenceState, TaskResult } from "@norsk/engine";
import {
  AiNote,
  Answer,
  AnswerInput,
  Ask,
  AudioButton,
  Button,
  DockRow,
  Focus,
  Remark,
  Stamp,
  effects,
} from "@norsk/ui";
import { color, radius, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Check, CircleAlert, X } from "lucide-react";
import { useState } from "react";

import { useExplain } from "../../explain";
import { learner } from "../../learner";
import { say } from "../say";
import type { Frame } from "./frame";
import { itemName } from "./items";
import { hintText, sentenceNote } from "./sentence-text";
import { taskStyles } from "./task-styles";
import { useTask } from "./use-task";

const styles = stylex.create({
  typed: {
    alignSelf: "flex-end",
    display: "flex",
    flexWrap: "wrap",
    gap: { default: "0.375rem", [stylex.env.desktop]: "0.5rem" },
    justifyContent: "flex-end",
  },
  typedWord: {
    alignItems: "center",
    backgroundColor: color.inverse,
    borderRadius: { default: "1rem", [stylex.env.desktop]: radius.r24 },
    color: color.onInverse,
    display: "inline-flex",
    fontSize: { default: text.s24, [stylex.env.desktop]: text.s40 },
    fontWeight: 500,
    gap: { default: "0.375rem", [stylex.env.desktop]: "0.625rem" },
    height: { default: "2.875rem", [stylex.env.desktop]: "4.5rem" },
    letterSpacing: "-0.02em",
    paddingLeft: { default: "1rem", [stylex.env.desktop]: "1.625rem" },
    paddingRight: { default: "0.75rem", [stylex.env.desktop]: "1.375rem" },
  },
  typedWordWrong: {
    boxShadow: {
      default: `inset 0 0 0 2px ${color.red}`,
      [stylex.env.desktop]: `inset 0 0 0 3px ${color.red}`,
    },
  },
  typedMark: {
    height: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
    width: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
  },
  // The marks sit on a white surface, where they need the darker tones.
  rightInk: { color: color.greenInk },
  wrongInk: { color: color.redInk },
  hint: {
    marginTop: { default: "0.25rem", [stylex.env.desktop]: "0.625rem" },
  },
  covered: {
    alignSelf: "stretch",
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r26 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    paddingBlock: { default: "0.875rem", [stylex.env.desktop]: "1.375rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.75rem" },
  },
  coveredHead: {
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBottom: { default: "0.5rem", [stylex.env.desktop]: "0.75rem" },
  },
  coveredTitle: {
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
    fontWeight: 500,
  },
  toRepeat: {
    color: color.fg2,
    flexShrink: 0,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
  },
  coveredRow: {
    alignItems: "center",
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    display: "flex",
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
    gap: "0.75rem",
    paddingBlock: { default: "0.5rem", [stylex.env.desktop]: "0.6875rem" },
  },
});

interface SentenceViewProps {
  state: SentenceState;
  send: (event: SentenceEvent) => void;
  frame: Frame;
  /** The line above the exchange. */
  stamp: string;
}

/** Draws a sentence task. Also used for the practice sentences of a pattern, which run inside its machine. */
export const SentenceView = ({
  state,
  send,
  frame,
  stamp,
}: SentenceViewProps) => {
  const [input, setInput] = useState("");
  const { sentence, covered, phase } = state;

  const check = () => {
    send({ text: input, type: "answer" });
    setInput("");
  };

  const retryWords = phase.step === "retry" ? phase.first.typed : null;
  const shown = phase.step === "result" ? phase.last.typed : retryWords;

  // The app has already decided right and wrong. The language model only adds words about the mistake.
  const ask = explainRequest(state);

  const aiText = useExplain(
    ask === null
      ? null
      : {
          answer: ask.answer,
          en: ask.en,
          kind: ask.kind,
          no: ask.no,
          topics: ask.itemIds.map((id) => itemName(id)),
        }
  );

  const failed = phase.step === "result" ? phase.failed : [];

  return (
    <Focus
      {...frame}
      scrollKey={`${phase.step}-${aiText === null ? 0 : 1}`}
      dock={
        phase.step === "result" ? (
          <DockRow>
            {failed.length > 0 ? (
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

      {shown === null ? null : (
        <div key={phase.step} {...stylex.props(effects.rise, styles.typed)}>
          {shown.map((typed, at) => (
            <span
              // The same word can be typed twice; its place is what tells two apart.
              key={at}
              {...stylex.props(
                styles.typedWord,
                !typed.ok && styles.typedWordWrong
              )}
            >
              {typed.word}
              {typed.ok ? (
                <Check
                  aria-label="right"
                  {...stylex.props(styles.typedMark, styles.rightInk)}
                />
              ) : (
                <X
                  aria-label="wrong"
                  {...stylex.props(styles.typedMark, styles.wrongInk)}
                />
              )}
            </span>
          ))}
        </div>
      )}

      {phase.step === "retry" ? (
        <>
          <Remark
            style={styles.hint}
            lead={phase.close ? "Almost." : "Not yet."}
          >
            {hintText(phase.hint)}
          </Remark>
          {aiText === null ? null : <AiNote label="Hint">{aiText}</AiNote>}
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
        <>
          <Answer
            audio={
              <AudioButton
                onPlay={() => {
                  say(sentence.no);
                }}
                style={taskStyles.answerAudio}
              />
            }
            good={phase.passed}
            note={sentenceNote(failed.length, phase.passed)}
          >
            {sentence.no}
          </Answer>
          {aiText === null ? null : (
            <AiNote label="Explanation">{aiText}</AiNote>
          )}
          {covered.length > 0 ? (
            <div {...stylex.props(effects.rise, styles.covered)}>
              <div {...stylex.props(styles.coveredHead)}>
                <span {...stylex.props(styles.coveredTitle)}>
                  This sentence reviews {covered.length}{" "}
                  {covered.length === 1 ? "item" : "items"}
                </span>
                {failed.length > 0 ? (
                  <span {...stylex.props(styles.toRepeat)}>
                    {covered.filter((id) => failed.includes(id)).length} to
                    repeat
                  </span>
                ) : null}
              </div>
              {covered.map((id) => {
                const bad = failed.includes(id);

                return (
                  <div key={id} {...stylex.props(styles.coveredRow)}>
                    {bad ? (
                      <CircleAlert
                        {...stylex.props(taskStyles.icon18, taskStyles.wrong)}
                      />
                    ) : (
                      <Check
                        {...stylex.props(taskStyles.icon18, taskStyles.right)}
                      />
                    )}
                    <span {...stylex.props(taskStyles.grow)}>
                      {itemName(id)}
                    </span>
                    <span {...stylex.props(taskStyles.quiet14)}>
                      {bad ? "needs work" : "reviewed"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
    </Focus>
  );
};

interface SentenceTaskProps {
  sentence: Sentence;
  frame: Frame;
  /** The line above the exchange. */
  stamp?: string;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** A whole sentence: English shown, Norwegian typed. One sentence reviews every item in it. */
export const SentenceTask = ({
  sentence,
  frame,
  stamp = "Say it in Norwegian",
  onDone,
}: SentenceTaskProps) => {
  const [state, send] = useTask(
    sentenceTask,
    () => ({ known: new Set(learner.memory().keys()), sentence }),
    onDone
  );

  return <SentenceView state={state} send={send} frame={frame} stamp={stamp} />;
};
