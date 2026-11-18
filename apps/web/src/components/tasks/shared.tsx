import { item } from "@norsk/content";
import type { Item } from "@norsk/content";
import type { QuizState } from "@norsk/engine";
import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";

import { Key } from "../ui";
import type { BlobKind } from "../ui";

/** What every task screen shows around the task itself. */
export interface Frame {
  block: BlobKind;
  title: string;
  label: string;
  progress: number;
  onClose: () => void;
}

export function shuffle<T>(list: T[]): T[] {
  const out = [...list];

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [out[i], out[j]] = [out[j], out[i]];
  }

  return out;
}

/** Short English description of what a pattern or word is, for hints and lists. */
export const nameOf = (it: Item) =>
  it.kind === "pattern"
    ? it.title!
    : `${it.text.replaceAll(/\s*___\s*/g, " … ").trim()} (${it.gloss})`;

export const itemName = (id: string) => nameOf(item(id));

/** True if the item is shown with an article in front, such as "et hus". */
export const hasArticle = (it: Item) =>
  it.pos === "noun" && it.display.includes(" ");

/** The small centred line that says where you are in a task. */
export function Stamp({ children }: { children: ReactNode }) {
  return (
    <div className="text-13 text-fg3 lg:text-15 self-center pb-1.5 font-medium lg:pb-2.5">
      {children}
    </div>
  );
}

/** What the app asks: a grey bubble on the left, with the thing to translate in large type. */
export function Ask({
  note,
  children,
}: {
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-raised max-w-full self-start rounded-[1.25rem] px-[1.125rem] py-3 lg:rounded-[1.75rem] lg:px-7 lg:py-[1.125rem]">
      {note && <div className="text-13 text-fg2 lg:text-16 pb-0.5">{note}</div>}
      <div className="text-26 lg:text-44 leading-[1.1] font-medium tracking-[-0.03em]">
        {children}
      </div>
    </div>
  );
}

/** What the learner typed: a white bubble on the right. */
export function Mine({ children }: { children: ReactNode }) {
  return (
    <div className="rise bg-inverse text-26 text-on-inverse lg:text-44 max-w-full self-end rounded-[1.25rem] px-[1.125rem] py-3 leading-[1.1] font-medium tracking-[-0.03em] break-words lg:rounded-[1.75rem] lg:px-7 lg:py-[1.125rem]">
      {children}
    </div>
  );
}

/** A short remark from the app: a strong lead and a quieter rest. */
export function Remark({
  lead,
  children,
  center,
  className = "",
}: {
  lead: string;
  children?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rise bg-raised text-16 lg:text-18 max-w-full rounded-[1.125rem] px-4 py-[0.6875rem] lg:max-w-[45rem] lg:rounded-[1.375rem] lg:px-5 lg:py-3.5 ${center ? "self-center" : "self-start"} ${className}`}
      role="status"
    >
      <span className="font-medium">{lead} </span>
      <span className="text-fg2">{children}</span>
    </div>
  );
}

/** Text written by the language model. It is labelled, so it is never mistaken for the app's own checking. */
export function AiNote({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rise bg-raised flex max-w-full flex-col gap-1.5 self-start rounded-[1.375rem] px-[1.125rem] py-3.5 lg:max-w-[45rem] lg:gap-2 lg:rounded-[1.75rem] lg:px-7 lg:py-5"
      role="status"
    >
      <div className="text-13 text-violet lg:text-15 flex items-center gap-2 font-medium">
        <Sparkles className="size-3.5 lg:size-4" />
        {label}
        <span className="text-fg3 font-normal">· written by AI</span>
      </div>
      <div className="text-16 lg:text-20">{children}</div>
    </div>
  );
}

/** The answer after a task: audio, the Norwegian, and a line on how it went. */
export function Answer({
  audio,
  good,
  note,
  children,
}: {
  audio: ReactNode;
  good?: boolean;
  note: string;
  children: ReactNode;
}) {
  return (
    <div className="rise border-line bg-inset flex items-center gap-3.5 self-stretch rounded-[1.25rem] border p-[1.125rem] lg:gap-5 lg:rounded-[1.625rem] lg:p-7">
      {audio}
      <div className="min-w-0">
        <div className="text-26 lg:text-44 leading-[1.1] font-medium tracking-[-0.03em] break-words">
          {children}
        </div>
        <div className="text-15 text-fg2 lg:text-18 flex items-center gap-2 pt-1">
          {good && (
            <Check className="text-green size-4 shrink-0 lg:size-[1.125rem]" />
          )}
          {note}
        </div>
      </div>
    </div>
  );
}

interface ChoicesProps {
  /** The question and what has been picked so far, from the task machine. */
  quiz: QuizState;
  onPick: (option: string) => void;
  /** Called a moment after the right option was picked. */
  onNext: () => void;
}

/** Multiple choice. A wrong pick is marked and the learner tries again; nothing is recorded. */
export function Choices({ quiz, onPick, onNext }: ChoicesProps) {
  const { question, wrong, answered } = quiz;
  const options = useMemo(() => shuffle(question.options), [question]);

  // A short pause on the right answer, so the learner sees it marked before the screen changes.
  useEffect(() => {
    if (!answered) {
      return;
    }

    const t = setTimeout(onNext, 450);

    return () => {
      clearTimeout(t);
    };
    // Only the answer starts the pause; onNext is a new function on every render.
  }, [answered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);

      if (n >= 1 && n <= options.length) {
        onPick(options[n - 1]);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  return (
    <div className="flex flex-col gap-2 pt-2 lg:gap-3 lg:pt-4">
      {options.map((o, i) => {
        const isRight = answered && o === question.options[0];
        const isWrong = wrong.includes(o);

        return (
          <button
            key={o}
            type="button"
            disabled={isWrong}
            onClick={() => {
              onPick(o);
            }}
            className={`press border-line bg-inset text-18 lg:text-24 flex min-h-[3.75rem] w-full items-center gap-3.5 rounded-[1.125rem] border py-3 pr-5 pl-4 text-left font-medium lg:min-h-20 lg:gap-[1.125rem] lg:rounded-3xl lg:pr-7 lg:pl-[1.375rem] ${
              isRight
                ? "shadow-[inset_0_0_0_1.5px_var(--color-green)]"
                : isWrong
                  ? "text-fg3 shadow-[inset_0_0_0_1.5px_var(--color-red)]"
                  : ""
            }`}
          >
            <Key>{i + 1}</Key>
            <span className={`flex-1 ${isWrong ? "line-through" : ""}`}>
              {o}
            </span>
            {isRight && (
              <Check
                className="text-green size-5 shrink-0"
                aria-label="right"
              />
            )}
            {isWrong && (
              <X className="text-red size-5 shrink-0" aria-label="wrong" />
            )}
          </button>
        );
      })}
    </div>
  );
}
