import type { Item, Sentence } from "@norsk/content";
import { introTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import {
  Answer,
  AnswerInput,
  Ask,
  AudioButton,
  Button,
  Card,
  Display,
  DockHint,
  Focus,
  Mine,
  Remark,
  Stamp,
  Tag,
  effects,
} from "@norsk/ui";
import {
  color,
  display,
  radius,
  text,
  tracking,
} from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Tag as TagIcon } from "lucide-react";
import { useState } from "react";

import { getState } from "../../engine/store";
import { say } from "../say";
import { cueKind, introHint, wordFact } from "./card-text";
import type { Frame } from "./frame";
import { hasArticle, soundOf } from "./items";
import { taskStyles } from "./task-styles";
import { belongsTo, splitLine } from "./text-parts";
import { useTask } from "./use-task";

/** A word or phrase longer than this is too long for the largest type. */
const LONGEST_IN_LARGE_TYPE = 9;

const styles = stylex.create({
  card: {
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r22, [stylex.env.desktop]: radius.r32 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    padding: { default: "1.25rem", [stylex.env.desktop]: "2.75rem" },
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: { default: "1rem", [stylex.env.desktop]: "2.25rem" },
  },
  headAudio: {
    height: { default: "4rem", [stylex.env.desktop]: "6.5rem" },
    width: { default: "4rem", [stylex.env.desktop]: "6.5rem" },
  },
  word: {
    fontSize: display.word,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    minWidth: 0,
    overflowWrap: "break-word",
  },
  wordLong: {
    fontSize: {
      default: text.s34,
      [stylex.env.desktop]: "clamp(2.5rem, 3.2vw, 4.5rem)",
    },
  },
  facts: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.625rem",
    paddingTop: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
  },
  sound: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s22 },
  },
  fact: {
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s15 },
    height: { default: "1.625rem", [stylex.env.desktop]: "2rem" },
    paddingLeft: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    paddingRight: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
  },
  divider: {
    backgroundColor: color.line,
    height: "1px",
    marginBottom: { default: "1rem", [stylex.env.desktop]: "1.75rem" },
    marginTop: { default: "1.125rem", [stylex.env.desktop]: "2rem" },
  },
  meaning: {
    fontSize: { default: text.s24, [stylex.env.desktop]: text.s40 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
  },
  example: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: color.raised,
    borderRadius: { default: radius.r18, [stylex.env.desktop]: radius.r22 },
    display: "flex",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1rem" },
    maxWidth: "100%",
    paddingBlock: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    paddingLeft: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    paddingRight: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
  },
  exampleAudio: {
    height: { default: "2rem", [stylex.env.desktop]: "2.75rem" },
    width: { default: "2rem", [stylex.env.desktop]: "2.75rem" },
  },
  exampleWords: {
    fontSize: { default: text.s18, [stylex.env.desktop]: text.s24 },
  },
  exampleMeaning: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
  },
  strong: {
    fontWeight: 600,
  },
  copy: {
    alignSelf: "flex-start",
    minWidth: { default: "13.75rem", [stylex.env.desktop]: "22.5rem" },
  },
  copyLabel: {
    color: color.fg3,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
  },
  copyWord: {
    fontSize: { default: text.s32, [stylex.env.desktop]: text.s56 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    paddingTop: "0.25rem",
  },
});

interface MarkedProps {
  sentence: Sentence;
  /** The item whose words are shown in a heavier weight. */
  id: string;
}

/** The example sentence, with the words of the new item in a heavier weight. */
const Marked = ({ sentence, id }: MarkedProps) =>
  splitLine(sentence.no, sentence.tokens).map((part) => (
    <span
      key={part.start}
      {...stylex.props(belongsTo(part, id) && styles.strong)}
    >
      {part.text}
    </span>
  ));

interface WordFactsProps {
  shown: Item;
}

const WordFacts = ({ shown }: WordFactsProps) => {
  const fact = wordFact(shown);

  if (shown.ipa === undefined && fact === null) {
    return null;
  }

  return (
    <div {...stylex.props(styles.facts)}>
      {shown.ipa === undefined ? null : (
        <span {...stylex.props(styles.sound)}>/{soundOf(shown.ipa)}/</span>
      )}
      {fact === null ? null : (
        <Tag icon={TagIcon} style={styles.fact}>
          {fact}
        </Tag>
      )}
    </div>
  );
};

interface IntroTaskProps {
  items: Item[];
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/**
 * Teaches a small group of words or phrases: hear and see each one, then type each one from its meaning.
 * There is no multiple-choice step: recalling a word builds memory better than recognising it,
 * and showing the whole group first keeps the first recall from being a copy.
 */
export const IntroTask = ({ items, frame, onDone }: IntroTaskProps) => {
  const [input, setInput] = useState("");

  const [state, send] = useTask(
    introTask,
    () => ({ items, known: new Set(getState().memory.keys()) }),
    onDone
  );

  const { phase, index, item, example, typed, misses, help, recalled } = state;
  const count = items.length > 1 ? ` · ${index + 1} of ${items.length}` : "";
  const long = item.display.length > LONGEST_IN_LARGE_TYPE;

  const check = () => {
    send({ text: input, type: "answer" });
    setInput("");
  };

  const next = () => {
    send({ type: "continue" });
    setInput("");
  };

  if (phase === "show") {
    return (
      <Focus
        {...frame}
        dock={
          <DockHint
            hint={
              index + 1 < items.length
                ? "Another new one comes next."
                : "You will type this in a moment."
            }
          >
            <Button key={index} autoFocus onClick={next} hint="↵">
              Continue
            </Button>
          </DockHint>
        }
      >
        <Stamp>Step 1 of 2 · Hear and see{count}</Stamp>
        <div key={item.id} {...stylex.props(effects.rise, styles.card)}>
          <div {...stylex.props(styles.head)}>
            <AudioButton
              onPlay={() => {
                say(item.text);
              }}
              style={styles.headAudio}
            />
            <div {...stylex.props(styles.word, long && styles.wordLong)}>
              <Display text={item.display} split={hasArticle(item)} />
            </div>
          </div>
          <WordFacts shown={item} />
          <div {...stylex.props(styles.divider)} />
          <div {...stylex.props(styles.meaning)}>{item.gloss}</div>
        </div>
        {example === null ? null : (
          <div key={example.id} {...stylex.props(effects.rise, styles.example)}>
            <AudioButton
              onPlay={() => {
                say(example.no);
              }}
              label="Play the example"
              style={styles.exampleAudio}
            />
            <div {...stylex.props(taskStyles.shrinks)}>
              <div {...stylex.props(styles.exampleWords)}>
                <Marked sentence={example} id={item.id} />
              </div>
              <div {...stylex.props(styles.exampleMeaning)}>{example.en}</div>
            </div>
          </div>
        )}
      </Focus>
    );
  }

  return (
    <Focus
      {...frame}
      scrollKey={`${index}-${misses}-${recalled}`}
      dock={
        recalled ? (
          <DockHint>
            <Button key="continue" autoFocus onClick={next} hint="↵">
              Continue
            </Button>
          </DockHint>
        ) : (
          <AnswerInput
            key={index}
            value={input}
            onChange={setInput}
            onSubmit={check}
          />
        )
      }
    >
      <Stamp>Step 2 of 2 · Recall{count}</Stamp>
      <Ask key={item.id} note={`${cueKind(item)}. Type it in Norwegian.`}>
        {item.gloss}
      </Ask>
      {typed === "" ? null : <Mine key={`${misses}-${recalled}`}>{typed}</Mine>}
      {recalled ? (
        <Answer
          audio={
            <AudioButton
              onPlay={() => {
                say(item.text);
              }}
              style={taskStyles.answerAudio}
            />
          }
          good
          note="Correct. It comes back in a few minutes."
        >
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      ) : null}
      {!recalled && (help === "article" || help === "start") ? (
        <Remark lead="Not yet.">{introHint(item, help)}</Remark>
      ) : null}
      {!recalled && help === "copy" ? (
        <Card key={misses} style={[effects.rise, styles.copy]}>
          <div {...stylex.props(styles.copyLabel)}>Copy it once</div>
          <div {...stylex.props(styles.copyWord)}>
            <Display text={item.answers[0] ?? ""} split={hasArticle(item)} />
          </div>
        </Card>
      ) : null}
    </Focus>
  );
};
