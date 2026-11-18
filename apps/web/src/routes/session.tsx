import { lessons } from "@norsk/content";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { Focus } from "../components/Focus";
import { CardTask } from "../components/tasks/CardTask";
import { IntroTask } from "../components/tasks/IntroTask";
import { PatternTask } from "../components/tasks/PatternTask";
import { SentenceTask } from "../components/tasks/SentenceTask";
import type { Frame, TaskResult } from "../components/tasks/shared";
import { SoundTask } from "../components/tasks/SoundTask";
import { StoryTask } from "../components/tasks/StoryTask";
import { Chip, buttonClass } from "../components/ui";
import { lessonState } from "../engine/select";
import { Session, blockOf } from "../engine/session";
import type { Task } from "../engine/session";
import { addStudyTime, getState, updateMeta } from "../engine/store";
import { stopSpeaking } from "../lib/speech";

export const Route = createFileRoute("/session")({
  validateSearch: (s: Record<string, unknown>) => ({
    minutes: Math.min(120, Math.max(1, Number(s.minutes) || 15)),
  }),
  component: SessionPage,
});

/** Time counted for one task is capped, so a break in the middle does not inflate study time. */
const MAX_TASK_MS = 3 * 60_000;

const BLOCK_TITLE = {
  sounds: "Sounds",
  review: "Review",
  new: "New",
  story: "Story",
} as const;

function SessionPage() {
  const { minutes } = Route.useSearch();
  const navigate = useNavigate();
  const session = useRef<Session>(null as unknown as Session);
  session.current ??= new Session(minutes);
  const [task, setTask] = useState<Task | null>(null);
  const [count, setCount] = useState(0);
  const startedAt = useRef(Date.now());

  const advance = useCallback(() => {
    const { memory, meta } = getState();
    startedAt.current = Date.now();
    setTask(
      session.current.next(
        {
          memory,
          storiesDone: new Set(meta.storiesDone),
          chosenLesson: meta.chosenLesson,
          soundStats: meta.sounds,
        },
        Date.now()
      )
    );
    setCount((c) => c + 1);
  }, []);

  useEffect(() => {
    advance();

    return () => {
      stopSpeaking();
    };
  }, [advance]);

  const onDone = async (result: TaskResult) => {
    if (!task || task.type === "done") {
      return;
    }

    const ms = Math.min(MAX_TASK_MS, Date.now() - startedAt.current);
    const s = session.current;
    s.record(ms, blockOf(task), result.itemIds);
    s.stats.right += result.right;
    s.stats.wrong += result.wrong;
    s.stats.taught += result.taught;

    if (blockOf(task) === "review") {
      s.stats.reviewed += result.itemIds.length;
    }

    await addStudyTime(ms);
    // A lesson picked on the Map stops being "chosen" once it is finished.
    const { memory, meta } = getState();

    if (
      meta.chosenLesson != null &&
      lessonState(lessons[meta.chosenLesson], memory) === "done"
    ) {
      await updateMeta({ chosenLesson: null });
    }

    advance();
  };

  if (!task) {
    return <div className="bg-panel lg:bg-base h-dvh" />;
  }

  const s = session.current;
  const onClose = () => void navigate({ to: "/" });

  if (task.type === "done") {
    const answered = s.stats.right + s.stats.wrong;
    const timeUp = s.elapsedMs >= s.budgetMs;
    const spent = Math.max(1, Math.round(s.elapsedMs / 60_000));
    const days = getState().meta.days.length;

    return (
      <Focus
        block="recall"
        title="Done"
        label={`${spent} min`}
        progress={1}
        onClose={onClose}
        wide
        dock={
          <div className="flex justify-center">
            <Link
              to="/"
              className={buttonClass("primary", "large", "w-full lg:w-auto")}
            >
              Back to Today
            </Link>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 pb-3.5 text-center lg:gap-[1.375rem] lg:pb-7">
          <Chip strong="Session complete.">
            {days ? `Day ${days}` : undefined}
          </Chip>
          <h1 className="text-display m-0 leading-none font-medium tracking-[-0.035em]">
            Ferdig!
          </h1>
          <p className="text-17 text-fg2 lg:text-22 m-0">
            {timeUp
              ? "Finished. Your time is up."
              : "Finished. Nothing more is due right now."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-4">
          {[
            [spent, spent === 1 ? "minute" : "minutes"],
            [s.stats.taught, "new items"],
            [s.stats.reviewed, "items reviewed"],
            [
              answered
                ? `${Math.round((s.stats.right / answered) * 100)}%`
                : "–",
              "right first time",
            ],
          ].map(([n, label]) => (
            <div
              key={label}
              className="border-line bg-inset flex flex-col rounded-[1.25rem] border p-4 lg:rounded-[1.625rem] lg:p-7"
            >
              <div className="text-34 lg:text-56 leading-[1.1] font-medium tracking-[-0.03em]">
                {n}
              </div>
              <div className="text-14 text-fg2 lg:text-18">{label}</div>
            </div>
          ))}
        </div>
        {s.stats.taught > 0 && (
          <p className="text-14 text-fg3 lg:text-18 m-0 max-w-[20.625rem] self-center pt-2 text-center lg:max-w-[38.75rem] lg:pt-5">
            New items come back within minutes at first. Open the app again
            later today, or tomorrow.
          </p>
        )}
      </Focus>
    );
  }

  const block = blockOf(task);
  const left = Math.max(0, Math.ceil((s.budgetMs - s.elapsedMs) / 60_000));

  const frame: Frame = {
    block,
    title: BLOCK_TITLE[block],
    label: `${left} min left`,
    progress: s.progress,
    onClose,
  };

  switch (task.type) {
    case "sound": {
      return (
        <SoundTask
          key={count}
          pair={task.pair}
          target={task.target}
          index={task.index}
          frame={{ ...frame, label: `${task.index + 1} of ${task.total}` }}
          onDone={onDone}
        />
      );
    }

    case "intro": {
      return (
        <IntroTask
          key={count}
          items={task.items}
          frame={frame}
          onDone={onDone}
        />
      );
    }

    case "pattern": {
      return (
        <PatternTask
          key={count}
          item={task.item}
          practice={task.practice}
          frame={frame}
          onDone={onDone}
        />
      );
    }

    case "card": {
      return (
        <CardTask key={count} item={task.item} frame={frame} onDone={onDone} />
      );
    }

    case "sentence": {
      return (
        <SentenceTask
          key={count}
          sentence={task.sentence}
          frame={frame}
          onDone={onDone}
        />
      );
    }

    case "story": {
      return (
        <StoryTask
          key={count}
          story={task.story}
          frame={frame}
          onDone={onDone}
        />
      );
    }
  }
}
