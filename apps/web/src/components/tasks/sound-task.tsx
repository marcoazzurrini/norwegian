import type { SoundPair } from "@norsk/content";
import { soundTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import {
  AudioButton,
  Button,
  DockRow,
  Focus,
  Key,
  Remark,
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
import { Check, X } from "lucide-react";
import { useEffect } from "react";

import { useVoices } from "../../speech";
import type { Frame } from "./frame";
import { taskStyles } from "./task-styles";
import { useTask } from "./use-task";

const SIDES = ["a", "b"] as const;

/** The word is played this long after the question appears. */
const PLAY_DELAY_MS = 350;

const styles = stylex.create({
  intro: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.375rem", [stylex.env.desktop]: "0.75rem" },
    textAlign: "center",
  },
  question: {
    fontSize: "clamp(1.875rem, 2.8125vw, 4.5rem)",
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  hint: {
    color: color.fg2,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s22 },
    margin: 0,
    maxWidth: { default: "20.625rem", [stylex.env.desktop]: "38.75rem" },
  },
  player: {
    display: "flex",
    justifyContent: "center",
    paddingBlock: { default: "1.125rem", [stylex.env.desktop]: "2.5rem" },
  },
  play: {
    height: { default: "4.75rem", [stylex.env.desktop]: "6.5rem" },
    width: { default: "4.75rem", [stylex.env.desktop]: "6.5rem" },
  },
  playIcon: {
    height: "37%",
    width: "37%",
  },
  words: {
    display: "flex",
    gap: { default: "0.625rem", [stylex.env.desktop]: "1rem" },
  },
  word: {
    alignItems: "center",
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r22, [stylex.env.desktop]: radius.r32 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: { default: "0.25rem", [stylex.env.desktop]: "0.5rem" },
    minWidth: 0,
    paddingBottom: { default: "1.125rem", [stylex.env.desktop]: "2rem" },
    paddingInline: { default: "0.75rem", [stylex.env.desktop]: "2rem" },
    paddingTop: { default: "1.625rem", [stylex.env.desktop]: "3.25rem" },
  },
  wordPlayed: {
    boxShadow: `inset 0 0 0 2px ${color.green}`,
  },
  wordMissed: {
    boxShadow: `inset 0 0 0 2px ${color.red}`,
  },
  spelling: {
    fontSize: display.word,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    maxWidth: "100%",
    overflowWrap: "break-word",
  },
  gloss: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s22 },
    paddingTop: { default: "0.25rem", [stylex.env.desktop]: "0.75rem" },
  },
  foot: {
    alignItems: "center",
    color: color.fg2,
    display: "flex",
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    height: { default: "2.125rem", [stylex.env.desktop]: "3.375rem" },
    paddingTop: { default: "0.625rem", [stylex.env.desktop]: "1.375rem" },
  },
  key: {
    fontSize: { default: text.s12, [stylex.env.desktop]: text.s15 },
    height: { default: "1.5rem", [stylex.env.desktop]: "2rem" },
    minWidth: { default: "1.5rem", [stylex.env.desktop]: "2rem" },
  },
  mark: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
  },
  markIcon: {
    height: "1.125rem",
    width: "1.125rem",
  },
  remark: {
    marginTop: { default: "0.25rem", [stylex.env.desktop]: "0.75rem" },
  },
});

interface SoundTaskProps {
  pair: SoundPair;
  target: "a" | "b";
  /** Position in the drill, used to change the speaker from one question to the next. */
  index: number;
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

/** Minimal-pair listening: one of two similar words is played, and the learner picks which. */
export const SoundTask = ({
  pair,
  target,
  index,
  frame,
  onDone,
}: SoundTaskProps) => {
  const voices = useVoices();

  const [state, send] = useTask(
    soundTask,
    () => ({ index, pair, target }),
    onDone
  );

  const { picked, right } = state;
  const answered = picked !== null;

  // Play once per question. The voices arrive asynchronously on some browsers, and when they
  // do the wait starts again, so that the word is played with one of them.
  useEffect(() => {
    const wait = setTimeout(() => {
      send({ type: "play" });
    }, PLAY_DELAY_MS);

    return () => {
      clearTimeout(wait);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- the number of voices is not read here; a change of it is what restarts the wait
  }, [voices.length, send]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "1") {
        send({ side: "a", type: "key" });
      }

      if (event.key === "2") {
        send({ side: "b", type: "key" });
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [send]);

  return (
    <Focus
      {...frame}
      scrollKey={picked}
      dock={
        <DockRow>
          <Button
            variant="secondary"
            onClick={() => {
              send({ type: "play" });
            }}
          >
            Play again
          </Button>
          {answered ? (
            <Button
              autoFocus
              onClick={() => {
                send({ type: "continue" });
              }}
              hint="↵"
            >
              Continue
            </Button>
          ) : (
            <span />
          )}
        </DockRow>
      }
    >
      <div {...stylex.props(styles.intro)}>
        <h1 {...stylex.props(styles.question)}>Which word do you hear?</h1>
        <p {...stylex.props(styles.hint)}>{pair.hint}</p>
      </div>
      <div {...stylex.props(styles.player)}>
        <AudioButton
          onPlay={() => {
            send({ type: "play" });
          }}
          label="Play the word"
          style={styles.play}
          iconStyle={styles.playIcon}
        />
      </div>
      <div {...stylex.props(styles.words)}>
        {SIDES.map((side, at) => {
          const isPlayed = answered && side === target;
          const isMissed = picked === side && side !== target;

          return (
            <button
              key={side}
              type="button"
              onClick={() => {
                send({ side, type: "tap" });
              }}
              {...stylex.props(
                effects.press,
                styles.word,
                isPlayed && styles.wordPlayed,
                isMissed && styles.wordMissed
              )}
            >
              <span {...stylex.props(styles.spelling)}>{pair[side].word}</span>
              <span {...stylex.props(styles.gloss)}>{pair[side].gloss}</span>
              <span {...stylex.props(styles.foot)}>
                {answered ? null : <Key style={styles.key}>{at + 1}</Key>}
                {isPlayed ? (
                  <span {...stylex.props(styles.mark)}>
                    <Check
                      {...stylex.props(styles.markIcon, taskStyles.right)}
                    />
                    The word
                  </span>
                ) : null}
                {isMissed ? (
                  <span {...stylex.props(styles.mark)}>
                    <X {...stylex.props(styles.markIcon, taskStyles.wrong)} />
                    Your pick
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      {answered ? (
        <Remark
          center
          style={styles.remark}
          lead={right ? "Correct." : `It was “${pair[target].word}”.`}
        >
          Tap each word to hear the difference.
        </Remark>
      ) : null}
    </Focus>
  );
};
