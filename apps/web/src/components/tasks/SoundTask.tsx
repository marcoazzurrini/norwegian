import type { SoundPair } from "@norsk/content";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { getState, updateMeta } from "../../engine/store";
import { speak, useVoices } from "../../lib/speech";
import { DockRow, Focus } from "../Focus";
import { AudioButton, Button, Key } from "../ui";
import { EMPTY_RESULT, Remark } from "./shared";
import type { Frame, TaskResult } from "./shared";

interface Props {
  pair: SoundPair;
  target: "a" | "b";
  /** Position in the drill, used to change the speaker from one question to the next. */
  index: number;
  frame: Frame;
  onDone: (result: TaskResult) => void;
}

/** Minimal-pair listening: one of two similar words is played, and the learner picks which. */
export function SoundTask({ pair, target, index, frame, onDone }: Props) {
  const voices = useVoices();
  const [picked, setPicked] = useState<"a" | "b" | null>(null);

  const play = () =>
    void speak(pair[target].word, { voiceIndex: index, rate: 0.8 });

  useEffect(() => {
    const t = setTimeout(play, 350);

    return () => {
      clearTimeout(t);
    };
    // Play once per question; the voices arrive asynchronously on some browsers.
  }, [pair.id, target, voices.length]);

  const pick = async (side: "a" | "b") => {
    if (picked) {
      return;
    }

    setPicked(side);
    const s = getState().meta.sounds[pair.group] ?? { right: 0, total: 0 };
    await updateMeta({
      sounds: {
        ...getState().meta.sounds,
        [pair.group]: {
          right: s.right + (side === target ? 1 : 0),
          total: s.total + 1,
        },
      },
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "1") {
        void pick("a");
      }

      if (e.key === "2") {
        void pick("b");
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  });

  const right = picked === target;

  return (
    <Focus
      {...frame}
      scrollKey={picked}
      dock={
        <DockRow>
          <Button variant="secondary" onClick={play}>
            Play again
          </Button>
          {picked ? (
            <Button
              autoFocus
              onClick={() => {
                onDone({
                  ...EMPTY_RESULT,
                  right: right ? 1 : 0,
                  wrong: right ? 0 : 1,
                });
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
      <div className="flex flex-col items-center gap-1.5 text-center lg:gap-3">
        <h1 className="m-0 text-[clamp(1.875rem,2.8125vw,4.5rem)] leading-none font-medium tracking-[-0.035em]">
          Which word do you hear?
        </h1>
        <p className="text-15 text-fg2 lg:text-22 m-0 max-w-[20.625rem] lg:max-w-[38.75rem]">
          {pair.hint}
        </p>
      </div>
      <div className="flex justify-center py-[1.125rem] lg:py-10">
        <AudioButton
          onClick={play}
          label="Play the word"
          className="size-[4.75rem] lg:size-[6.5rem] [&>svg]:size-[37%]"
        />
      </div>
      <div className="flex gap-2.5 lg:gap-4">
        {(["a", "b"] as const).map((side, i) => {
          const isTarget = picked && side === target;
          const isWrongPick = picked === side && side !== target;

          return (
            <button
              key={side}
              type="button"
              onClick={() =>
                picked
                  ? void speak(pair[side].word, {
                      voiceIndex: index,
                      rate: 0.8,
                    })
                  : void pick(side)
              }
              className={`press border-line bg-inset flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[1.375rem] border px-3 pt-[1.625rem] pb-[1.125rem] lg:gap-2 lg:rounded-[2rem] lg:px-8 lg:pt-[3.25rem] lg:pb-8 ${
                isTarget
                  ? "shadow-[inset_0_0_0_2px_var(--color-green)]"
                  : isWrongPick
                    ? "shadow-[inset_0_0_0_2px_var(--color-red)]"
                    : ""
              }`}
            >
              <span className="text-word max-w-full leading-none font-medium tracking-[-0.035em] break-words">
                {pair[side].word}
              </span>
              <span className="text-16 text-fg2 lg:text-22 pt-1 lg:pt-3">
                {pair[side].gloss}
              </span>
              <span className="text-14 text-fg2 lg:text-16 flex h-[2.125rem] items-center pt-2.5 lg:h-[3.375rem] lg:pt-[1.375rem]">
                {!picked && (
                  <Key className="lg:text-15 lg:h-8 lg:min-w-8">{i + 1}</Key>
                )}
                {isTarget && (
                  <span className="flex items-center gap-1.5">
                    <Check className="text-green size-[1.125rem]" />
                    The word
                  </span>
                )}
                {isWrongPick && (
                  <span className="flex items-center gap-1.5">
                    <X className="text-red size-[1.125rem]" />
                    Your pick
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {picked && (
        <Remark
          center
          className="mt-1 lg:mt-3"
          lead={right ? "Correct." : `It was “${pair[target].word}”.`}
        >
          Tap each word to hear the difference.
        </Remark>
      )}
    </Focus>
  );
}
