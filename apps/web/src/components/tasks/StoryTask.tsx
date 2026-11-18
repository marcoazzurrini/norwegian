import { items } from "@norsk/content";
import type { Story, Token } from "@norsk/content";
import { Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { itemState } from "../../engine/select";
import { getState, updateMeta, useApp } from "../../engine/store";
import { speak, stopSpeaking } from "../../lib/speech";
import { DockRow, Focus } from "../Focus";
import { AudioButton, Button, Display, Tag } from "../ui";
import { Choices, EMPTY_RESULT, Stamp, hasArticle } from "./shared";
import type { Frame, TaskResult } from "./shared";

interface Picked {
  line: number;
  index: number;
  token: Token;
}

/** What a tapped word means: its taught item, or the story's own gloss for a new word. */
function lookup(story: Story, t: Token) {
  const id = t.w ?? t.c;

  if (id) {
    return { text: items[id].display, gloss: items[id].gloss, item: items[id] };
  }

  const gloss = story.glosses[t.t.toLowerCase()];

  return gloss ? { text: t.t, gloss, item: null } : null;
}

interface Props {
  story: Story;
  frame: Frame;
  onDone: (result: TaskResult) => void;
}

/** A short text built from known words: listen while reading, tap a word for its meaning, then answer questions. */
export function StoryTask({ story, frame, onDone }: Props) {
  const { memory } = useApp();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const [question, setQuestion] = useState<number | null>(null);
  const [showEnglish, setShowEnglish] = useState(false);
  const stop = useRef(false);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    []
  );

  const playAll = async () => {
    if (playing !== null) {
      stop.current = true;
      stopSpeaking();
      setPlaying(null);

      return;
    }

    stop.current = false;

    for (let i = 0; i < story.lines.length && !stop.current; i++) {
      setPlaying(i);
      await speak(story.lines[i].no);
    }

    setPlaying(null);
  };

  const finish = async () => {
    const done = getState().meta.storiesDone;

    if (!done.includes(story.id)) {
      await updateMeta({ storiesDone: [...done, story.id] });
    }

    onDone(EMPTY_RESULT);
  };

  const meaning = picked && lookup(story, picked.token);

  if (question !== null) {
    const q = story.questions[question];

    return (
      <Focus {...frame}>
        <Stamp>
          Question {question + 1} of {story.questions.length}
        </Stamp>
        <h1
          key={question}
          className="rise m-0 text-[clamp(2.125rem,2.8125vw,4.5rem)] leading-none font-medium tracking-[-0.035em]"
        >
          {q.prompt}
        </h1>
        <Choices
          key={`c${question}`}
          quiz={q}
          onRight={() => {
            question + 1 < story.questions.length
              ? setQuestion(question + 1)
              : void finish();
          }}
        />
      </Focus>
    );
  }

  // A story with speakers is laid out as a conversation; one without is plain narration.
  const speakers = [...new Set(story.lines.map((l) => l.who).filter(Boolean))];
  const conversation = speakers.length > 0;

  const words = (li: number) =>
    splitLine(story.lines[li].no, story.lines[li].tokens).map((part, pi) =>
      part.token ? (
        <button
          key={pi}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPicked({ line: li, index: part.index!, token: part.token! });
          }}
          className={`rounded-md border-0 p-0 [font-weight:inherit] text-inherit ${
            picked?.line === li && picked.index === part.index
              ? "bg-inverse !text-on-inverse px-1"
              : story.glosses[part.token.t.toLowerCase()] && !part.token.w
                ? "decoration-orange bg-transparent underline decoration-dotted decoration-2 underline-offset-4"
                : "bg-transparent"
          }`}
        >
          {part.text}
        </button>
      ) : (
        <span key={pi}>{part.text}</span>
      )
    );

  return (
    <Focus
      {...frame}
      dock={
        <DockRow>
          <Button
            variant="secondary"
            onClick={() => {
              setShowEnglish((s) => !s);
            }}
          >
            {showEnglish ? "Hide English" : "Show English"}
          </Button>
          <Button
            onClick={() => {
              story.questions.length ? setQuestion(0) : void finish();
            }}
          >
            Questions
          </Button>
        </DockRow>
      }
    >
      <div
        className={`flex items-center justify-between gap-3 ${conversation ? "pb-1.5 lg:pb-[1.375rem]" : "pb-3 lg:pb-7"}`}
      >
        <div className="min-w-0">
          <h1 className="text-stage m-0 leading-none font-medium tracking-[-0.035em]">
            {story.title}
          </h1>
          <p className="text-15 text-fg2 lg:text-22 m-0 pt-0.5 lg:pt-2.5">
            {story.titleEn}. Listen and read along.
          </p>
        </div>
        <AudioButton
          onClick={() => void playAll()}
          label={playing === null ? "Play the whole story" : "Stop"}
          icon={playing === null ? Play : Square}
          className="size-12 lg:size-16 [&>svg]:size-[38%]"
        />
      </div>

      {conversation ? (
        story.lines.map((line, li) => {
          const mine = speakers.indexOf(line.who) % 2 === 1;
          const active = playing === li;

          return (
            <div
              key={li}
              className={`flex max-w-[88%] flex-col gap-1 ${mine ? "items-end self-end" : "items-start self-start"}`}
            >
              <button
                type="button"
                onClick={() => void speak(line.no)}
                className="press text-12 text-fg3 lg:text-15 border-0 bg-transparent px-2 py-0 font-medium"
                aria-label={`Play ${line.who}'s line`}
              >
                {line.who}
              </button>
              <div
                className={`rounded-[1.125rem] border px-3.5 py-[0.5625rem] transition-colors duration-200 lg:rounded-3xl lg:px-6 lg:py-3.5 ${active ? "border-strong bg-raised" : "border-line bg-transparent"}`}
              >
                <p
                  className={`text-18 lg:text-28 m-0 tracking-[-0.01em] ${active ? "text-fg font-medium" : "text-fg2"}`}
                >
                  {words(li)}
                </p>
                {showEnglish && (
                  <p className="text-13 text-fg3 lg:text-17 m-0 pt-0.5 leading-[1.45]">
                    {line.en}
                  </p>
                )}
              </div>
            </div>
          );
        })
      ) : (
        <div className="-ml-[0.9375rem] flex flex-col gap-3 lg:-ml-[1.4375rem] lg:gap-[1.125rem]">
          {story.lines.map((line, li) => {
            const active = playing === li;

            return (
              <div
                key={li}
                className="flex cursor-pointer items-stretch gap-3 lg:gap-5"
                onClick={() => void speak(line.no)}
              >
                <span
                  className={`w-[3px] shrink-0 rounded-full transition-colors duration-200 ${active ? "bg-fg" : "bg-transparent"}`}
                />
                <div>
                  <p
                    className={`text-20 lg:text-32 m-0 leading-[1.45] tracking-[-0.01em] ${active ? "text-fg font-medium" : "text-fg2"}`}
                  >
                    {words(li)}
                  </p>
                  {showEnglish && (
                    <p className="text-13 text-fg3 lg:text-17 m-0 leading-[1.45]">
                      {line.en}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {meaning ? (
        <div
          key={`${picked.line}-${picked.index}`}
          className="rise border-line bg-inset sticky bottom-0 mt-1 flex items-center gap-3.5 self-stretch rounded-[1.25rem] border px-3.5 py-3 lg:mt-3.5 lg:rounded-[1.625rem] lg:px-[1.375rem] lg:py-[1.125rem]"
        >
          <AudioButton
            text={meaning.item?.text ?? meaning.text}
            className="size-9 lg:size-11"
          />
          <div className="min-w-0 flex-1">
            <div className="text-17 lg:text-22 font-medium">
              {meaning.item ? (
                <Display
                  text={meaning.text}
                  split={
                    hasArticle(meaning.item) || meaning.text.startsWith("å ")
                  }
                />
              ) : (
                meaning.text
              )}
            </div>
            <div className="text-14 text-fg2 lg:text-16">{meaning.gloss}</div>
          </div>
          {meaning.item ? (
            <Tag
              tone={
                itemState(meaning.item, memory) === "stable"
                  ? "good"
                  : itemState(meaning.item, memory) === "learning"
                    ? "progress"
                    : "neutral"
              }
            >
              {itemState(meaning.item, memory) === "stable"
                ? "Stable"
                : itemState(meaning.item, memory) === "learning"
                  ? "Learning"
                  : "Not taught yet"}
            </Tag>
          ) : (
            <Tag tone="new">New word</Tag>
          )}
        </div>
      ) : (
        <p className="text-13 text-fg3 lg:text-16 m-0 self-center pt-1.5 text-center lg:pt-4">
          Tap a word to see its meaning.{" "}
          {conversation
            ? "Tap a name to hear the line."
            : "Tap a sentence to hear it."}
        </p>
      )}
    </Focus>
  );
}

/** Cuts a line into its words and the punctuation between them, keeping each word linked to its token. */
function splitLine(
  text: string,
  tokens: Token[]
): { text: string; token?: Token; index?: number }[] {
  const parts: { text: string; token?: Token; index?: number }[] = [];
  let at = 0;
  tokens.forEach((token, index) => {
    const found = text.indexOf(token.t, at);

    if (found === -1) {
      return;
    }

    if (found > at) {
      parts.push({ text: text.slice(at, found) });
    }

    parts.push({ text: token.t, token, index });
    at = found + token.t.length;
  });

  if (at < text.length) {
    parts.push({ text: text.slice(at) });
  }

  return parts;
}
