import type { Item, Sentence } from "@norsk/content";
import { introTask } from "@norsk/engine";
import type { TaskResult } from "@norsk/engine";
import { Tag as TagIcon } from "lucide-react";
import { useState } from "react";

import { getState } from "../../engine/store";
import { AnswerInput } from "../AnswerInput";
import { DockHint, Focus } from "../Focus";
import { AudioButton, Button, Display, Tag } from "../ui";
import { cueKind } from "./CardTask";
import { Answer, Ask, Mine, Remark, Stamp, hasArticle } from "./shared";
import type { Frame } from "./shared";
import { useTask } from "./use-task";

/** The example sentence, with the words of the new item in a heavier weight. */
function Marked({ sentence, id }: { sentence: Sentence; id: string }) {
  const parts: { text: string; strong: boolean }[] = [];
  let at = 0;

  for (const token of sentence.tokens) {
    const found = sentence.no.indexOf(token.t, at);

    if (found === -1) {
      continue;
    }

    if (found > at) {
      parts.push({ text: sentence.no.slice(at, found), strong: false });
    }

    parts.push({ text: token.t, strong: token.w === id || token.c === id });
    at = found + token.t.length;
  }

  if (at < sentence.no.length) {
    parts.push({ text: sentence.no.slice(at), strong: false });
  }

  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.strong ? "font-semibold" : ""}>
          {p.text}
        </span>
      ))}
    </>
  );
}

function WordFacts({ it }: { it: Item }) {
  const present = it.forms?.find((f) => f.label === "now")?.form;

  const fact =
    it.pos === "noun" && it.gender && it.gender !== "pl"
      ? `${it.gender} word`
      : it.gender === "pl"
        ? "always plural"
        : it.pos === "verb" && present && present !== it.text
          ? `now: ${present}`
          : it.kind === "chunk"
            ? "phrase"
            : null;

  if (!it.ipa && !fact) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-3.5 lg:pt-5">
      {it.ipa && (
        <span className="text-16 text-fg2 lg:text-22">
          /{it.ipa.replaceAll("ˈ", "")}/
        </span>
      )}
      {fact && (
        <Tag icon={TagIcon} className="lg:text-15 lg:h-8 lg:pr-3.5 lg:pl-2.5">
          {fact}
        </Tag>
      )}
    </div>
  );
}

interface Props {
  items: Item[];
  frame: Frame;
  onDone: (result: TaskResult) => void;
}

/**
 * Teaches a small group of words or phrases: hear and see each one, then type each one from its meaning.
 * There is no multiple-choice step: recalling a word builds memory better than recognising it,
 * and showing the whole group first keeps the first recall from being a copy.
 */
export function IntroTask({ items, frame, onDone }: Props) {
  const [input, setInput] = useState("");

  const [state, send] = useTask(
    introTask,
    () => ({ items, known: new Set(getState().memory.keys()) }),
    onDone
  );

  const { phase, index, item, example, typed, misses, help, recalled } = state;
  const count = items.length > 1 ? ` · ${index + 1} of ${items.length}` : "";
  // A phrase is too long for the largest type.
  const long = item.display.length > 9;

  const check = () => {
    send({ type: "answer", text: input });
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
        <div
          key={item.id}
          className="rise border-line bg-inset flex flex-col rounded-[1.375rem] border p-5 lg:rounded-[2rem] lg:p-11"
        >
          <div className="flex items-center gap-4 lg:gap-9">
            <AudioButton
              text={item.text}
              className="size-16 lg:size-[6.5rem]"
            />
            <div
              className={`min-w-0 leading-none font-medium tracking-[-0.035em] break-words ${long ? "text-34 lg:text-[clamp(2.5rem,3.2vw,4.5rem)]" : "text-word"}`}
            >
              <Display text={item.display} split={hasArticle(item)} />
            </div>
          </div>
          <WordFacts it={item} />
          <div className="bg-line mt-[1.125rem] mb-4 h-px lg:mt-8 lg:mb-7" />
          <div className="text-24 lg:text-40 leading-[1.1] font-medium tracking-[-0.03em]">
            {item.gloss}
          </div>
        </div>
        {example && (
          <div
            key={example.id}
            className="rise bg-raised flex max-w-full items-center gap-3 self-start rounded-[1.125rem] py-2.5 pr-4 pl-2.5 lg:gap-4 lg:rounded-[1.375rem] lg:py-3.5 lg:pr-6 lg:pl-3.5"
          >
            <AudioButton
              text={example.no}
              label="Play the example"
              className="size-8 lg:size-11"
            />
            <div className="min-w-0">
              <div className="text-18 lg:text-24">
                <Marked sentence={example} id={item.id} />
              </div>
              <div className="text-14 text-fg2 lg:text-16">{example.en}</div>
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
      {typed && <Mine key={`${misses}-${recalled}`}>{typed}</Mine>}
      {recalled ? (
        <Answer
          audio={
            <AudioButton
              text={item.text}
              className="size-12 lg:size-[3.75rem]"
            />
          }
          good
          note="Correct. It comes back in a few minutes."
        >
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      ) : help === "article" || help === "start" ? (
        <Remark lead="Not yet.">
          {help === "article"
            ? "Is it an en, ei or et word?"
            : `It starts with “${item.text.slice(0, item.kind === "chunk" ? 3 : 1)}…”. Try again.`}
        </Remark>
      ) : help === "copy" ? (
        <div
          key={misses}
          className="rise border-line bg-inset flex min-w-[13.75rem] flex-col self-start rounded-[1.25rem] border p-[1.125rem] lg:min-w-[22.5rem] lg:rounded-[1.625rem] lg:p-7"
        >
          <div className="text-15 text-fg3 lg:text-18">Copy it once</div>
          <div className="text-32 lg:text-56 pt-1 leading-[1.1] font-medium tracking-[-0.03em]">
            <Display text={item.answers[0]} split={hasArticle(item)} />
          </div>
        </div>
      ) : null}
    </Focus>
  );
}
