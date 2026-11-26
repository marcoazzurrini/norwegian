import type { Example, Item, Sentence } from "@norsk/course";
import { patternTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import {
  AudioButton,
  Button,
  Display,
  DockHint,
  Focus,
  ListCard,
  Remark,
  Stamp,
  effects,
} from "@norsk/ui";
import { color, radius, text, tracking } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { ArrowRight } from "lucide-react";

import { learner } from "../../learner";
import { say } from "../say";
import { contrast, spokenForm } from "./contrast";
import type { Frame } from "./frame";
import { QuizChoices } from "./quiz-choices";
import { SentenceView } from "./sentence-task";
import { taskStyles } from "./task-styles";
import { useTask } from "./use-task";

/** A form that starts with an article, such as "en bil". */
const WITH_ARTICLE = /^(?:en|ei|et) \S+$/u;

const styles = stylex.create({
  lead: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s22 },
    margin: 0,
    paddingBottom: { default: "0.625rem", [stylex.env.desktop]: "1.375rem" },
    paddingTop: { default: "0.125rem", [stylex.env.desktop]: "0.375rem" },
  },
  examples: {
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r32 },
    paddingBlock: { default: "0.25rem", [stylex.env.desktop]: "0.625rem" },
    paddingInline: { default: "0.875rem", [stylex.env.desktop]: "1.5rem" },
  },
  rule: {
    marginTop: "0.375rem",
  },
  example: {
    alignItems: "center",
    display: "grid",
    gap: { default: "0.625rem", [stylex.env.desktop]: "1.5rem" },
    gridTemplateColumns: {
      default: "2.25rem 1fr 1.25rem 1fr",
      [stylex.env.desktop]: "3.25rem 1fr 2rem 1fr 8.75rem",
    },
    paddingBlock: { default: "0.875rem", [stylex.env.desktop]: "1.375rem" },
    paddingInline: { default: "0.125rem", [stylex.env.desktop]: "0.75rem" },
  },
  exampleAudio: {
    height: { default: "2rem", [stylex.env.desktop]: "2.75rem" },
    width: { default: "2rem", [stylex.env.desktop]: "2.75rem" },
  },
  form: {
    fontSize: { default: text.s20, [stylex.env.desktop]: text.s36 },
    fontWeight: 500,
    letterSpacing: "-0.02em",
    minWidth: 0,
    overflowWrap: "break-word",
  },
  formBlock: {
    display: "block",
    fontSize: { default: text.s20, [stylex.env.desktop]: text.s36 },
    fontWeight: 500,
    letterSpacing: "-0.02em",
    overflowWrap: "break-word",
  },
  kept: {
    color: color.fg2,
  },
  added: {
    textDecorationLine: "underline",
    textDecorationThickness: { default: "2px", [stylex.env.desktop]: "3px" },
    textUnderlineOffset: { default: "6px", [stylex.env.desktop]: "9px" },
  },
  arrow: {
    color: color.fg3,
    height: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
    width: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
  },
  // An example with one form takes the place of the first form, the arrow and the second.
  alone: {
    gridColumn: {
      default: "span 3 / span 3",
      [stylex.env.desktop]: "span 2 / span 2",
    },
  },
  // The meaning sits under the form on a phone and in its own column on a wide screen.
  meaningPhone: {
    color: color.fg3,
    display: { default: "block", [stylex.env.desktop]: "none" },
    fontSize: text.s14,
  },
  meaningWide: {
    color: color.fg3,
    display: { default: "none", [stylex.env.desktop]: "block" },
    fontSize: text.s18,
    textAlign: "right",
  },
  meaningWideAlone: {
    gridColumn: { default: null, [stylex.env.desktop]: "span 2 / span 2" },
  },
  prompt: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: color.raised,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r28 },
    display: "flex",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
    maxWidth: "100%",
    paddingBlock: { default: "0.625rem", [stylex.env.desktop]: "1.125rem" },
    paddingLeft: { default: "0.625rem", [stylex.env.desktop]: "1.125rem" },
    paddingRight: { default: "1.125rem", [stylex.env.desktop]: "2rem" },
  },
  promptAudio: {
    height: { default: "2.5rem", [stylex.env.desktop]: "3.5rem" },
    width: { default: "2.5rem", [stylex.env.desktop]: "3.5rem" },
  },
  promptNote: {
    color: color.fg2,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s16 },
  },
  promptWords: {
    fontSize: { default: text.s30, [stylex.env.desktop]: text.s56 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    overflowWrap: "break-word",
  },
});

interface ExampleRowProps {
  example: Example;
}

const ExampleRow = ({ example }: ExampleRowProps) => {
  const { from, kept, added } = contrast(example.target);
  const changed = added !== "";

  const form = (
    <span {...stylex.props(taskStyles.shrinks)}>
      <span {...stylex.props(styles.formBlock)}>
        <span {...stylex.props(changed && styles.kept)}>{kept}</span>
        {changed ? <span {...stylex.props(styles.added)}>{added}</span> : null}
      </span>
      <span {...stylex.props(styles.meaningPhone)}>{example.base}</span>
    </span>
  );

  return (
    <div {...stylex.props(styles.example)}>
      <AudioButton
        onPlay={() => {
          say(spokenForm(example.target));
        }}
        style={styles.exampleAudio}
      />
      {from === null ? (
        <span {...stylex.props(styles.alone)}>{form}</span>
      ) : (
        <>
          <span {...stylex.props(styles.form)}>
            <Display text={from} split={WITH_ARTICLE.test(from)} />
          </span>
          <ArrowRight aria-label="becomes" {...stylex.props(styles.arrow)} />
          {form}
        </>
      )}
      <span
        {...stylex.props(
          styles.meaningWide,
          from === null && styles.meaningWideAlone
        )}
      >
        {example.base}
      </span>
    </div>
  );
};

interface PatternTaskProps {
  item: Item;
  practice: Sentence[];
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** Teaches a grammar pattern: contrasting examples and a short rule, reading questions, then typed sentences. */
export const PatternTask = ({
  item,
  practice,
  frame,
  onDone,
}: PatternTaskProps) => {
  const [state, send] = useTask(
    patternTask,
    () => ({ item, known: new Set(learner().memory().keys()), practice }),
    onDone
  );

  const { phase, quiz, steps } = state;

  if (phase.step === "produce") {
    return (
      <SentenceView
        key={phase.sentence.sentence.id}
        state={phase.sentence}
        send={send}
        frame={frame}
        stamp={`Step 3 of 3 · Produce it · ${phase.index + 1} of ${practice.length}`}
      />
    );
  }

  if (phase.step === "see") {
    return (
      <Focus
        {...frame}
        dock={
          <DockHint
            hint={`Next: ${quiz.length} quick ${quiz.length === 1 ? "question" : "questions"}.`}
          >
            <Button
              autoFocus
              onClick={() => {
                send({ type: "continue" });
              }}
              hint="↵"
            >
              Continue
            </Button>
          </DockHint>
        }
      >
        <Stamp>Step 1 of {steps} · See it</Stamp>
        <h1 {...stylex.props(taskStyles.heading)}>{item.title}</h1>
        <p {...stylex.props(styles.lead)}>Watch what changes.</p>
        <ListCard style={styles.examples}>
          {item.examples?.map((example) => (
            <ExampleRow key={example.target} example={example} />
          ))}
        </ListCard>
        <Remark lead="The rule." style={styles.rule}>
          {item.rule?.join(" ")}
        </Remark>
      </Focus>
    );
  }

  const { question, index } = phase.quiz;

  return (
    <Focus {...frame}>
      <Stamp>
        Step 2 of {steps} · Read it
        {quiz.length > 1 ? ` · ${index + 1} of ${quiz.length}` : ""}
      </Stamp>
      <div key={index} {...stylex.props(effects.rise, styles.prompt)}>
        <AudioButton
          onPlay={() => {
            say(question.prompt);
          }}
          style={styles.promptAudio}
        />
        <div {...stylex.props(taskStyles.shrinks)}>
          <div {...stylex.props(styles.promptNote)}>What does it mean?</div>
          <div {...stylex.props(styles.promptWords)}>{question.prompt}</div>
        </div>
      </div>
      <QuizChoices
        key={`c${index}`}
        quiz={phase.quiz}
        onPick={(option) => {
          send({ option, type: "pick" });
        }}
        onNext={() => {
          send({ type: "next" });
        }}
      />
    </Focus>
  );
};
