// The composer: a field for Norwegian answers, buttons for the three letters missing on most keyboards, and send.
import * as stylex from "@stylexjs/stylex";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SyntheticEvent } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

const LETTERS = ["æ", "ø", "å"] as const;

const styles = stylex.create({
  frame: {
    alignItems: "center",
    backgroundColor: color.panel,
    borderColor: { default: color.strong, ":focus-within": color.fg3 },
    borderRadius: radius.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: { default: "0.625rem", [stylex.env.desktop]: "1rem" },
    height: { default: "3.5rem", [stylex.env.desktop]: "4.5rem" },
    paddingLeft: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    paddingRight: { default: "0.5rem", [stylex.env.desktop]: "0.875rem" },
    width: "100%",
  },
  letters: {
    display: "flex",
    flexShrink: 0,
    gap: "0.25rem",
  },
  letter: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    borderWidth: 0,
    display: "flex",
    fontSize: text.s16,
    fontWeight: 500,
    height: "2.25rem",
    justifyContent: "center",
    width: "2.25rem",
  },
  field: {
    "::placeholder": { color: color.fg3 },
    backgroundColor: "transparent",
    borderWidth: 0,
    color: color.fg,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s20 },
    minWidth: 0,
    padding: 0,
  },
  send: {
    alignItems: "center",
    backgroundColor: color.inverse,
    borderRadius: radius.pill,
    borderWidth: 0,
    color: color.onInverse,
    display: "flex",
    flexShrink: 0,
    height: "2.5rem",
    justifyContent: "center",
    opacity: { default: null, ":disabled": 0.4 },
    width: "2.5rem",
  },
  sendIcon: {
    height: "1.125rem",
    width: "1.125rem",
  },
});

const keepFocus = (event: SyntheticEvent) => {
  event.preventDefault();
};

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter or the send button, and only when there is something to send. */
  onSubmit: () => void;
  /** Also the accessible name of the field. */
  placeholder?: string;
}

export const AnswerInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Type in Norwegian",
}: AnswerInputProps) => {
  const field = useRef<HTMLInputElement>(null);
  const empty = value.trim() === "";

  // The learner starts typing at once, without a click.
  useEffect(() => {
    field.current?.focus();
  }, []);

  const insert = (letter: string) => {
    const input = field.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;

    onChange(value.slice(0, start) + letter + value.slice(end));

    // The caret can only be placed once React has written the new value.
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + 1, start + 1);
    });
  };

  const send = () => {
    if (!empty) {
      onSubmit();
    }

    field.current?.focus();
  };

  return (
    <div {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.letters)}>
        {LETTERS.map((letter) => (
          <button
            key={letter}
            type="button"
            // The letters are reached by pointer; Tab goes from the field to send.
            tabIndex={-1}
            aria-label={`Insert ${letter}`}
            // A press must not take focus from the field: on a phone that closes the keyboard for a moment.
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => {
              insert(letter);
            }}
            {...stylex.props(effects.press, styles.letter)}
          >
            {letter}
          </button>
        ))}
      </div>
      <input
        ref={field}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !empty) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        lang="nb"
        enterKeyHint="send"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        {...stylex.props(styles.field)}
      />
      <button
        type="button"
        onClick={send}
        disabled={empty}
        aria-label="Check the answer"
        {...stylex.props(effects.press, styles.send)}
      >
        <ArrowUp {...stylex.props(styles.sendIcon)} />
      </button>
    </div>
  );
};
