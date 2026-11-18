import type { Example, Item, Sentence } from "@norsk/content";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { teach } from "../../engine/store";
import { DockHint, Focus } from "../Focus";
import { AudioButton, Button, Display } from "../ui";
import { SentenceTask } from "./SentenceTask";
import { Choices, Remark, Stamp } from "./shared";
import type { Frame, TaskResult } from "./shared";

/** Splits "en bil > bilen" and marks the part of the second form that is new. */
function contrast(no: string): { from?: string; to: string; added: string } {
  const [a, b] = no.split(">").map((s) => s.trim());

  if (!b) {
    return { to: a, added: "" };
  }

  const base = a.split(" ").pop()!.replaceAll(/[!?.]/g, "");
  const target = b.split(" ").pop()!;
  const prefix = b.slice(0, b.length - target.length);

  if (target.startsWith(base) && target.length > base.length) {
    return { from: a, to: prefix + base, added: target.slice(base.length) };
  }

  let i = 0;

  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }

  return i > 2 && i < b.length
    ? { from: a, to: b.slice(0, i), added: b.slice(i) }
    : { from: a, to: b, added: "" };
}

const ARTICLE = /^(en|ei|et) \S+$/;

function ExampleRow({ ex }: { ex: Example }) {
  const c = contrast(ex.no);
  const spoken = ex.no.split(">").pop()!.trim();

  const form = (
    <span className="min-w-0">
      <span className="text-20 lg:text-36 block font-medium tracking-[-0.02em] break-words">
        <span className={c.added ? "text-fg2" : ""}>{c.to}</span>
        {c.added && (
          <span className="underline decoration-2 underline-offset-[6px] lg:decoration-[3px] lg:underline-offset-[9px]">
            {c.added}
          </span>
        )}
      </span>
      <span className="text-14 text-fg3 block lg:hidden">{ex.en}</span>
    </span>
  );

  return (
    <div className="grid grid-cols-[2.25rem_1fr_1.25rem_1fr] items-center gap-2.5 px-0.5 py-3.5 lg:grid-cols-[3.25rem_1fr_2rem_1fr_8.75rem] lg:gap-6 lg:px-3 lg:py-[1.375rem]">
      <AudioButton text={spoken} className="size-8 lg:size-11" />
      {c.from ? (
        <>
          <span className="text-20 lg:text-36 min-w-0 font-medium tracking-[-0.02em] break-words">
            <Display text={c.from} split={ARTICLE.test(c.from)} />
          </span>
          <ArrowRight
            className="text-fg3 size-4 lg:size-6"
            aria-label="becomes"
          />
          {form}
        </>
      ) : (
        <span className="col-span-3 lg:col-span-2">{form}</span>
      )}
      <span
        className={`text-18 text-fg3 hidden text-right lg:block ${c.from ? "" : "lg:col-span-2"}`}
      >
        {ex.en}
      </span>
    </div>
  );
}

interface Props {
  item: Item;
  practice: Sentence[];
  frame: Frame;
  onDone: (result: TaskResult) => void;
}

/** Teaches a grammar pattern: contrasting examples and a short rule, reading questions, then typed sentences. */
export function PatternTask({ item, practice, frame, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [practiceIndex, setPracticeIndex] = useState(0);

  const [result, setResult] = useState<TaskResult>({
    itemIds: [item.id],
    right: 0,
    wrong: 0,
    taught: 1,
  });

  const quiz = item.quiz ?? [];
  const steps = 2 + (practice.length ? 1 : 0);

  const afterQuiz = async () => {
    await teach([item.id]);

    if (practice.length) {
      setStep(2);
    } else {
      onDone(result);
    }
  };

  if (step === 2) {
    return (
      <SentenceTask
        key={practice[practiceIndex].id}
        sentence={practice[practiceIndex]}
        frame={frame}
        stamp={`Step 3 of 3 · Produce it · ${practiceIndex + 1} of ${practice.length}`}
        onDone={(r) => {
          const merged = {
            ...result,
            right: result.right + r.right,
            wrong: result.wrong + r.wrong,
          };

          if (practiceIndex + 1 < practice.length) {
            setResult(merged);
            setPracticeIndex(practiceIndex + 1);
          } else {
            onDone(merged);
          }
        }}
      />
    );
  }

  if (step === 0) {
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
                quiz.length ? setStep(1) : void afterQuiz();
              }}
              hint="↵"
            >
              Continue
            </Button>
          </DockHint>
        }
      >
        <Stamp>Step 1 of {steps} · See it</Stamp>
        <h1 className="m-0 text-[clamp(2.125rem,2.8125vw,4.5rem)] leading-none font-medium tracking-[-0.035em]">
          {item.title}
        </h1>
        <p className="text-16 text-fg2 lg:text-22 m-0 pt-0.5 pb-2.5 lg:pt-1.5 lg:pb-[1.375rem]">
          Watch what changes.
        </p>
        <div className="border-line bg-inset [&>*+*]:border-line flex flex-col rounded-[1.25rem] border px-3.5 py-1 lg:rounded-[2rem] lg:px-6 lg:py-2.5 [&>*+*]:border-t">
          {item.examples!.map((ex) => (
            <ExampleRow key={ex.no} ex={ex} />
          ))}
        </div>
        <Remark lead="The rule." className="mt-1.5">
          {item.rule!.join(" ")}
        </Remark>
      </Focus>
    );
  }

  const q = quiz[quizIndex];

  return (
    <Focus {...frame}>
      <Stamp>
        Step 2 of {steps} · Read it
        {quiz.length > 1 ? ` · ${quizIndex + 1} of ${quiz.length}` : ""}
      </Stamp>
      {q && (
        <>
          <div
            key={quizIndex}
            className="rise bg-raised flex max-w-full items-center gap-3 self-start rounded-[1.25rem] py-2.5 pr-[1.125rem] pl-2.5 lg:gap-5 lg:rounded-[1.75rem] lg:py-[1.125rem] lg:pr-8 lg:pl-[1.125rem]"
          >
            <AudioButton text={q.prompt} className="size-10 lg:size-14" />
            <div className="min-w-0">
              <div className="text-13 text-fg2 lg:text-16">
                What does it mean?
              </div>
              <div className="text-30 lg:text-56 leading-[1.1] font-medium tracking-[-0.03em] break-words">
                {q.prompt}
              </div>
            </div>
          </div>
          <Choices
            key={`c${quizIndex}`}
            quiz={q}
            onRight={() => {
              quizIndex + 1 < quiz.length
                ? setQuizIndex(quizIndex + 1)
                : void afterQuiz();
            }}
          />
        </>
      )}
    </Focus>
  );
}
