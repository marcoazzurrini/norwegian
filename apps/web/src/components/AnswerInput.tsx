import { ArrowUp } from "lucide-react";
import { useEffect, useRef } from "react";

interface AnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

/** The composer: a field for Norwegian answers, buttons for the three letters missing on most keyboards, and send. */
export function AnswerInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Type in Norwegian",
}: AnswerInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const insert = (letter: string) => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, at) + letter + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + 1, at + 1);
    });
  };

  const send = () => {
    if (value.trim()) {
      onSubmit();
    }

    ref.current?.focus();
  };

  return (
    <div className="border-strong bg-panel focus-within:border-fg3 flex h-14 w-full items-center gap-2.5 rounded-full border pr-2 pl-2.5 lg:h-[4.5rem] lg:gap-4 lg:px-3.5">
      <div className="flex shrink-0 gap-1">
        {["æ", "ø", "å"].map((l) => (
          <button
            key={l}
            type="button"
            tabIndex={-1}
            onClick={() => {
              insert(l);
            }}
            className="press bg-control text-16 flex size-9 items-center justify-center rounded-full border-0 font-medium"
            aria-label={`Insert ${l}`}
          >
            {l}
          </button>
        ))}
      </div>
      <input
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
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
        className="text-17 text-fg placeholder:text-fg3 lg:text-20 min-w-0 flex-1 border-0 bg-transparent p-0"
      />
      <button
        type="button"
        onClick={send}
        disabled={!value.trim()}
        aria-label="Check the answer"
        className="press bg-inverse text-on-inverse flex size-10 shrink-0 items-center justify-center rounded-full border-0 disabled:opacity-40"
      >
        <ArrowUp className="size-[1.125rem]" />
      </button>
    </div>
  );
}
