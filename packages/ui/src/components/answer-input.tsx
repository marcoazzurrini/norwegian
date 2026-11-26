// The composer: a field for answers, buttons for the letters of the language that most keyboards lack, and send.
import * as stylex from "@stylexjs/stylex";
import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SyntheticEvent } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";
import { Key } from "./key";

/** A letter that most keyboards lack, and the key that types it here. */
export interface AnswerLetter {
  letter: string;
  /** A key that no answer uses, such as "'" for "æ". */
  key: string;
}

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
    // With a keyboard the button also names its key, so it is wider than the round one of a touch screen.
    gap: "0.5rem",
    height: "2.25rem",
    justifyContent: "center",
    paddingInline: { default: "13px 6px", [stylex.env.touch]: 0 },
    width: { default: null, [stylex.env.touch]: "2.25rem" },
  },
  letterKey: {
    borderRadius: radius.pill,
    height: "1.375rem",
    minWidth: "1.375rem",
    paddingInline: "6px",
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
  /** Also the accessible name of the field, such as "Type in Norwegian". */
  placeholder: string;
  /** The language of the answers, as a language tag such as "nb". */
  lang: string;
  /** The letters to offer as buttons and keys. None for a language whose letters are on every keyboard. */
  letters?: readonly AnswerLetter[];
}

const NO_LETTERS: readonly AnswerLetter[] = [];

export const AnswerInput = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  lang,
  letters = NO_LETTERS,
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
      {letters.length === 0 ? null : (
        <div {...stylex.props(styles.letters)}>
          {letters.map(({ letter, key }) => (
            <button
              key={letter}
              type="button"
              // The letters are reached by pointer; Tab goes from the field to send.
              tabIndex={-1}
              aria-label={`Insert ${letter}`}
              aria-keyshortcuts={key}
              // A press must not take focus from the field: on a phone that closes the keyboard for a moment.
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              onClick={() => {
                insert(letter);
              }}
              {...stylex.props(effects.press, styles.letter)}
            >
              {letter}
              <Key style={styles.letterKey}>{key}</Key>
            </button>
          ))}
        </div>
      )}
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

            return;
          }

          const letter = letters.find(({ key }) => key === event.key)?.letter;

          if (letter !== undefined && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            insert(letter);
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        lang={lang}
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
