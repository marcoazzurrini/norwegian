// Multiple choice. A wrong pick is marked and the learner tries again; the right pick is marked before the task moves on.
import * as stylex from "@stylexjs/stylex";
import { Check, X } from "lucide-react";
import { useEffect, useEffectEvent } from "react";

import { Key } from "../components/key";
import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

// The right pick stays on screen this long, so the learner sees the mark before the task moves on.
const RIGHT_PAUSE_MS = 450;

const styles = stylex.create({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.5rem", [stylex.env.desktop]: "0.75rem" },
    paddingTop: { default: "0.5rem", [stylex.env.desktop]: "1rem" },
  },
  option: {
    alignItems: "center",
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r18, [stylex.env.desktop]: radius.r24 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    fontSize: { default: text.s18, [stylex.env.desktop]: text.s24 },
    fontWeight: 500,
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
    minHeight: { default: "3.75rem", [stylex.env.desktop]: "5rem" },
    paddingBlock: "0.75rem",
    paddingLeft: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
    paddingRight: { default: "1.25rem", [stylex.env.desktop]: "1.75rem" },
    textAlign: "left",
    // The ring and the greyed text of a marked option fade in; they do not snap.
    transitionProperty: "transform, box-shadow, color",
    width: "100%",
  },
  right: {
    boxShadow: `inset 0 0 0 1.5px ${color.green}`,
  },
  wrong: {
    boxShadow: `inset 0 0 0 1.5px ${color.red}`,
    color: color.fg3,
  },
  words: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  struck: {
    textDecorationLine: "line-through",
  },
  mark: {
    flexShrink: 0,
    height: "1.25rem",
    width: "1.25rem",
  },
  markRight: { color: color.green },
  markWrong: { color: color.red },
});

interface ChoicesProps {
  /** The options in the order they are shown. The caller shuffles them. */
  options: readonly string[];
  /** The option that is right. */
  answer: string;
  /** The wrong options picked so far. They are marked and cannot be picked again. */
  wrong: readonly string[];
  /** True once the right option was picked. It is then marked. */
  answered: boolean;
  /** Called with the option the learner picks, by pointer or by its number key. */
  onPick: (option: string) => void;
  /** Called a moment after `answered` becomes true, when the task may move on. */
  onNext: () => void;
}

// The component shows the state it is given; the caller decides what a pick means.
export const Choices = ({
  options,
  answer,
  wrong,
  answered,
  onPick,
  onNext,
}: ChoicesProps) => {
  const next = useEffectEvent(onNext);

  useEffect(() => {
    const pause = answered ? setTimeout(next, RIGHT_PAUSE_MS) : undefined;

    return () => {
      clearTimeout(pause);
    };
  }, [answered]);

  // The number keys pick an option, so the learner need not reach for the mouse.
  const pickByKey = useEffectEvent((event: KeyboardEvent) => {
    const option = options[Number(event.key) - 1];

    // A wrong option is disabled for the pointer, so it is for the keyboard too.
    if (option !== undefined && !wrong.includes(option)) {
      onPick(option);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", pickByKey);

    return () => {
      window.removeEventListener("keydown", pickByKey);
    };
  }, []);

  return (
    <div {...stylex.props(styles.list)}>
      {options.map((option, index) => {
        const isRight = answered && option === answer;
        const isWrong = wrong.includes(option);

        return (
          <button
            key={option}
            type="button"
            disabled={isWrong}
            onClick={() => {
              onPick(option);
            }}
            {...stylex.props(
              effects.press,
              styles.option,
              isRight && styles.right,
              isWrong && styles.wrong
            )}
          >
            <Key>{index + 1}</Key>
            <span {...stylex.props(styles.words, isWrong && styles.struck)}>
              {option}
            </span>
            {isRight ? (
              <Check
                aria-label="right"
                {...stylex.props(effects.pop, styles.mark, styles.markRight)}
              />
            ) : null}
            {isWrong ? (
              <X
                aria-label="wrong"
                {...stylex.props(effects.pop, styles.mark, styles.markWrong)}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
