import type { Story, StoryLine } from "@norsk/content";
import { itemState, storyTask } from "@norsk/engine";
import type {
  ItemState,
  StoryEvent,
  StoryState,
  TaskResult,
  WordMeaning,
} from "@norsk/engine";
import {
  AudioButton,
  Button,
  Display,
  DockRow,
  Focus,
  Stamp,
  Tag,
  effects,
} from "@norsk/ui";
import type { TagTone } from "@norsk/ui";
import {
  color,
  display,
  radius,
  text,
  tracking,
} from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { useMemory } from "../../learner";
import { speak, stopSpeaking } from "../../speech";
import { say } from "../say";
import type { Frame } from "./frame";
import { hasArticle } from "./items";
import { QuizChoices } from "./quiz-choices";
import { taskStyles } from "./task-styles";
import { splitLine } from "./text-parts";
import { useTask } from "./use-task";

// A line that is being read aloud changes colour over this time.
const FADE = {
  transitionDuration: "200ms",
  transitionProperty:
    "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
  // A colour change takes the plain curve; the strong one is for things that move.
  transitionTimingFunction: "ease",
} as const;

const styles = stylex.create({
  head: {
    alignItems: "center",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  headTalk: {
    paddingBottom: { default: "0.375rem", [stylex.env.desktop]: "1.375rem" },
  },
  headProse: {
    paddingBottom: { default: "0.75rem", [stylex.env.desktop]: "1.75rem" },
  },
  title: {
    fontSize: display.stage,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  about: {
    color: color.fg2,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s22 },
    margin: 0,
    paddingTop: { default: "0.125rem", [stylex.env.desktop]: "0.625rem" },
  },
  playAll: {
    height: { default: "3rem", [stylex.env.desktop]: "4rem" },
    width: { default: "3rem", [stylex.env.desktop]: "4rem" },
  },
  playAllIcon: {
    height: "38%",
    width: "38%",
  },
  turn: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    maxWidth: "88%",
  },
  turnLeft: {
    alignItems: "flex-start",
    alignSelf: "flex-start",
  },
  turnRight: {
    alignItems: "flex-end",
    alignSelf: "flex-end",
  },
  speaker: {
    backgroundColor: "transparent",
    borderWidth: 0,
    color: color.fg3,
    fontSize: { default: text.s12, [stylex.env.desktop]: text.s15 },
    fontWeight: 500,
    paddingBlock: 0,
    paddingInline: "0.5rem",
  },
  bubble: {
    ...FADE,
    backgroundColor: "transparent",
    borderColor: color.line,
    borderRadius: { default: radius.r18, [stylex.env.desktop]: radius.r24 },
    borderStyle: "solid",
    borderWidth: 1,
    paddingBlock: { default: "0.5625rem", [stylex.env.desktop]: "0.875rem" },
    paddingInline: { default: "0.875rem", [stylex.env.desktop]: "1.5rem" },
  },
  bubbleRead: {
    backgroundColor: color.raised,
    borderColor: color.strong,
  },
  talk: {
    color: color.fg2,
    fontSize: { default: text.s18, [stylex.env.desktop]: text.s28 },
    letterSpacing: "-0.01em",
    margin: 0,
  },
  read: {
    color: color.fg,
    fontWeight: 500,
  },
  talkEnglish: {
    color: color.fg3,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s17 },
    lineHeight: 1.45,
    margin: 0,
    paddingTop: "0.125rem",
  },
  prose: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1.125rem" },
    marginLeft: { default: "-0.9375rem", [stylex.env.desktop]: "-1.4375rem" },
  },
  proseLine: {
    alignItems: "stretch",
    cursor: "pointer",
    display: "flex",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
  },
  proseBar: {
    ...FADE,
    backgroundColor: "transparent",
    borderRadius: radius.pill,
    flexShrink: 0,
    width: "3px",
  },
  proseBarRead: {
    backgroundColor: color.fg,
  },
  proseWords: {
    color: color.fg2,
    fontSize: { default: text.s20, [stylex.env.desktop]: text.s32 },
    letterSpacing: "-0.01em",
    lineHeight: 1.45,
    margin: 0,
  },
  proseEnglish: {
    color: color.fg3,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s17 },
    lineHeight: 1.45,
    margin: 0,
  },
  word: {
    backgroundColor: "transparent",
    borderRadius: "0.375rem",
    borderWidth: 0,
    color: "inherit",
    fontWeight: "inherit",
    padding: 0,
  },
  wordPicked: {
    backgroundColor: color.inverse,
    color: color.onInverse,
    paddingInline: "0.25rem",
  },
  // A word that is not part of the course has its meaning in the story itself.
  wordGlossed: {
    textDecorationColor: color.orange,
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationThickness: "2px",
    textUnderlineOffset: "4px",
  },
  meaning: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r26 },
    borderStyle: "solid",
    borderWidth: 1,
    bottom: 0,
    display: "flex",
    gap: "0.875rem",
    marginTop: { default: "0.25rem", [stylex.env.desktop]: "0.875rem" },
    paddingBlock: { default: "0.75rem", [stylex.env.desktop]: "1.125rem" },
    paddingInline: { default: "0.875rem", [stylex.env.desktop]: "1.375rem" },
    position: "sticky",
  },
  meaningAudio: {
    height: { default: "2.25rem", [stylex.env.desktop]: "2.75rem" },
    width: { default: "2.25rem", [stylex.env.desktop]: "2.75rem" },
  },
  meaningText: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  meaningWord: {
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s22 },
    fontWeight: 500,
  },
  meaningGloss: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
  },
  tip: {
    alignSelf: "center",
    color: color.fg3,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s16 },
    margin: 0,
    paddingTop: { default: "0.375rem", [stylex.env.desktop]: "1rem" },
    textAlign: "center",
  },
});

/** How well the learner knows the item behind a tapped word. */
const KNOWN: Record<ItemState, { label: string; tone: TagTone }> = {
  learning: { label: "Learning", tone: "progress" },
  locked: { label: "Not taught yet", tone: "neutral" },
  ready: { label: "Not taught yet", tone: "neutral" },
  stable: { label: "Stable", tone: "good" },
};

interface WordsProps {
  story: Story;
  line: StoryLine;
  at: number;
  picked: StoryState["picked"];
  send: (event: StoryEvent) => void;
}

/** The words of a line. Each can be tapped for its meaning. */
const Words = ({ story, line, at, picked, send }: WordsProps) =>
  splitLine(line.no, line.tokens).map((part) => {
    if (part.token === null) {
      return <span key={part.start}>{part.text}</span>;
    }

    const isPicked = picked?.line === at && picked.index === part.index;

    const isGlossed =
      story.glosses[part.token.t.toLowerCase()] !== undefined &&
      part.token.w === undefined;

    return (
      <button
        key={part.start}
        type="button"
        onClick={(event) => {
          // A tap on a word is not a tap on its sentence.
          event.stopPropagation();
          send({ index: part.index, line: at, type: "tapWord" });
        }}
        {...stylex.props(
          styles.word,
          !isPicked && isGlossed && styles.wordGlossed,
          isPicked && styles.wordPicked
        )}
      >
        {part.text}
      </button>
    );
  });

interface MeaningProps {
  meaning: WordMeaning;
}

/** What a tapped word means, and how well the learner knows it. */
const Meaning = ({ meaning }: MeaningProps) => {
  const memory = useMemory();
  const known = meaning.item;
  const look = known === null ? null : KNOWN[itemState(known, memory)];

  return (
    <div {...stylex.props(effects.rise, styles.meaning)}>
      <AudioButton
        onPlay={() => {
          say(known?.text ?? meaning.text);
        }}
        style={styles.meaningAudio}
      />
      <div {...stylex.props(styles.meaningText)}>
        <div {...stylex.props(styles.meaningWord)}>
          {known === null ? (
            meaning.text
          ) : (
            <Display
              text={meaning.text}
              split={hasArticle(known) || meaning.text.startsWith("å ")}
            />
          )}
        </div>
        <div {...stylex.props(styles.meaningGloss)}>{meaning.gloss}</div>
      </div>
      {look === null ? (
        <Tag tone="new">New word</Tag>
      ) : (
        <Tag tone={look.tone}>{look.label}</Tag>
      )}
    </div>
  );
};

interface StoryTaskProps {
  story: Story;
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** A short text built from known words: listen while reading, tap a word for its meaning, then answer questions. */
export const StoryTask = ({ story, frame, onDone }: StoryTaskProps) => {
  const [state, send] = useTask(storyTask, () => ({ story }), onDone);
  const { phase, picked, showEnglish } = state;
  // Which line is being read aloud. Playback follows the audio, so it lives here and not in the machine.
  const [playing, setPlaying] = useState<number | null>(null);
  const stopped = useRef(false);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    []
  );

  /** Reads the story aloud from a line on, until the end or until it is stopped. */
  const readFrom = async (at: number): Promise<void> => {
    const line = story.lines[at];

    if (line === undefined || stopped.current) {
      setPlaying(null);

      return;
    }

    setPlaying(at);
    await speak(line.no);
    await readFrom(at + 1);
  };

  const playOrStop = () => {
    if (playing === null) {
      stopped.current = false;
      readFrom(0).catch(reportError);

      return;
    }

    stopped.current = true;
    stopSpeaking();
    setPlaying(null);
  };

  if (phase.step === "questions") {
    const { question, index } = phase.quiz;

    return (
      <Focus {...frame}>
        <Stamp>
          Question {index + 1} of {story.questions.length}
        </Stamp>
        <h1 key={index} {...stylex.props(effects.rise, taskStyles.heading)}>
          {question.prompt}
        </h1>
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
  }

  // A story with speakers is laid out as a conversation; one without is plain narration.
  const speakers = [
    ...new Set(story.lines.map((line) => line.who).filter((who) => who !== "")),
  ];

  const conversation = speakers.length > 0;

  const english = (line: StoryLine, style: stylex.StyleXStyles): ReactNode =>
    showEnglish ? <p {...stylex.props(style)}>{line.en}</p> : null;

  return (
    <Focus
      {...frame}
      dock={
        <DockRow>
          <Button
            variant="secondary"
            onClick={() => {
              send({ type: "toggleEnglish" });
            }}
          >
            {showEnglish ? "Hide English" : "Show English"}
          </Button>
          <Button
            onClick={() => {
              send({ type: "continue" });
            }}
          >
            Questions
          </Button>
        </DockRow>
      }
    >
      <div
        {...stylex.props(
          styles.head,
          conversation ? styles.headTalk : styles.headProse
        )}
      >
        <div {...stylex.props(taskStyles.shrinks)}>
          <h1 {...stylex.props(styles.title)}>{story.title}</h1>
          <p {...stylex.props(styles.about)}>
            {story.titleEn}. Listen and read along.
          </p>
        </div>
        <AudioButton
          onPlay={playOrStop}
          label={playing === null ? "Play the whole story" : "Stop"}
          icon={playing === null ? Play : Square}
          style={styles.playAll}
          iconStyle={styles.playAllIcon}
        />
      </div>

      {conversation ? (
        story.lines.map((line, at) => {
          const active = playing === at;

          return (
            <div
              // The lines of a story never change, so the place of a line names it.
              key={`${at}-${line.no}`}
              {...stylex.props(
                styles.turn,
                speakers.indexOf(line.who) % 2 === 1
                  ? styles.turnRight
                  : styles.turnLeft
              )}
            >
              <button
                type="button"
                onClick={() => {
                  send({ line: at, type: "hearLine" });
                }}
                aria-label={`Play ${line.who}'s line`}
                {...stylex.props(effects.press, styles.speaker)}
              >
                {line.who}
              </button>
              <div
                {...stylex.props(styles.bubble, active && styles.bubbleRead)}
              >
                <p {...stylex.props(styles.talk, active && styles.read)}>
                  <Words
                    story={story}
                    line={line}
                    at={at}
                    picked={picked}
                    send={send}
                  />
                </p>
                {english(line, styles.talkEnglish)}
              </div>
            </div>
          );
        })
      ) : (
        <div {...stylex.props(styles.prose)}>
          {story.lines.map((line, at) => {
            const active = playing === at;

            return (
              // The words inside are buttons, so the line itself cannot be one: a tap on it is a
              // shortcut for the pointer, and the big play button reads every line for the keyboard.
              // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a button may not hold other buttons
              <div
                key={`${at}-${line.no}`}
                onClick={() => {
                  send({ line: at, type: "hearLine" });
                }}
                {...stylex.props(styles.proseLine)}
              >
                <span
                  {...stylex.props(
                    styles.proseBar,
                    active && styles.proseBarRead
                  )}
                />
                <div>
                  <p
                    {...stylex.props(styles.proseWords, active && styles.read)}
                  >
                    <Words
                      story={story}
                      line={line}
                      at={at}
                      picked={picked}
                      send={send}
                    />
                  </p>
                  {english(line, styles.proseEnglish)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {picked !== null && picked.meaning !== null ? (
        <Meaning
          key={`${picked.line}-${picked.index}`}
          meaning={picked.meaning}
        />
      ) : (
        <p {...stylex.props(styles.tip)}>
          Tap a word to see its meaning.{" "}
          {conversation
            ? "Tap a name to hear the line."
            : "Tap a sentence to hear it."}
        </p>
      )}
    </Focus>
  );
};
