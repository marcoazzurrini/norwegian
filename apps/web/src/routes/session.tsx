import { lessons } from "@norsk/content";
import { Session, blockOf, lessonState } from "@norsk/engine";
import type { Task, TaskResult } from "@norsk/engine";
import { Card, Chip, Focus, buttonStyle } from "@norsk/ui";
import { color, display, text, tracking } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  minutesLeft,
  sessionMinutes,
  summaryOf,
} from "../components/session-summary";
import { TaskScreen } from "../components/tasks/task-screen";
import { addStudyTime, getState, updateMeta } from "../engine/store";
import { stopSpeaking } from "../lib/speech";

const BLOCK_TITLE = {
  new: "New",
  review: "Review",
  sounds: "Sounds",
  story: "Story",
} as const;

const styles = stylex.create({
  dock: {
    display: "flex",
    justifyContent: "center",
  },
  back: {
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  hero: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.75rem", [stylex.env.desktop]: "1.375rem" },
    paddingBottom: { default: "0.875rem", [stylex.env.desktop]: "1.75rem" },
    textAlign: "center",
  },
  done: {
    fontSize: display.display,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  closing: {
    color: color.fg2,
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s22 },
    margin: 0,
  },
  tiles: {
    display: "grid",
    gap: { default: "0.625rem", [stylex.env.desktop]: "1rem" },
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      [stylex.env.desktop]: "repeat(4, minmax(0, 1fr))",
    },
  },
  tile: {
    padding: { default: "1rem", [stylex.env.desktop]: "1.75rem" },
  },
  tileValue: {
    fontSize: { default: text.s34, [stylex.env.desktop]: text.s56 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
  },
  tileLabel: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s18 },
  },
  note: {
    alignSelf: "center",
    color: color.fg3,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s18 },
    margin: 0,
    maxWidth: { default: "20.625rem", [stylex.env.desktop]: "38.75rem" },
    paddingTop: { default: "0.5rem", [stylex.env.desktop]: "1.25rem" },
    textAlign: "center",
  },
});

interface DoneProps {
  session: Session;
  onClose: () => void;
}

/** The end of a session: what was done in it. */
const Done = ({ session, onClose }: DoneProps) => {
  const { spent, closing, tiles, taughtNew } = summaryOf(session);
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
        <div {...stylex.props(styles.dock)}>
          <Link
            to="/"
            {...stylex.props(buttonStyle("primary", "large"), styles.back)}
          >
            Back to Today
          </Link>
        </div>
      }
    >
      <div {...stylex.props(styles.hero)}>
        <Chip strong="Session complete.">
          {days > 0 ? `Day ${days}` : undefined}
        </Chip>
        <h1 {...stylex.props(styles.done)}>Ferdig!</h1>
        <p {...stylex.props(styles.closing)}>{closing}</p>
      </div>
      <div {...stylex.props(styles.tiles)}>
        {tiles.map((tile) => (
          <Card key={tile.label} style={styles.tile}>
            <div {...stylex.props(styles.tileValue)}>{tile.value}</div>
            <div {...stylex.props(styles.tileLabel)}>{tile.label}</div>
          </Card>
        ))}
      </div>
      {taughtNew ? (
        <p {...stylex.props(styles.note)}>
          New items come back within minutes at first. Open the app again later
          today, or tomorrow.
        </p>
      ) : null}
    </Focus>
  );
};

/** A lesson picked on the Map stops being "chosen" once it is finished. */
const forgetFinishedChoice = async () => {
  const { memory, meta } = getState();

  const chosen =
    meta.chosenLesson === null ? undefined : lessons[meta.chosenLesson];

  if (chosen !== undefined && lessonState(chosen, memory) === "done") {
    await updateMeta({ chosenLesson: null });
  }
};

/** A session under way: the task on screen, and when it was put there. */
interface Run {
  session: Session;
  task: Task;
  /** How many tasks the session has shown. Each task gets a fresh screen. */
  count: number;
  startedAt: number;
}

/** Asks the session for its next task, given what the learner knows at this moment. */
const nextRun = (session: Session, count: number, now: number): Run => {
  const { memory, meta } = getState();

  const task = session.next(
    {
      chosenLesson: meta.chosenLesson,
      memory,
      soundStats: meta.sounds,
      storiesDone: new Set(meta.storiesDone),
    },
    now
  );

  return { count, session, startedAt: now, task };
};

const SessionPage = () => {
  const { minutes } = Route.useSearch();
  const navigate = useNavigate();

  const [run, setRun] = useState(() =>
    nextRun(new Session(minutes, Math.random), 1, Date.now())
  );

  const { session, task } = run;

  useEffect(
    () => () => {
      stopSpeaking();
    },
    []
  );

  const onClose = () => {
    navigate({ to: "/" }).catch(reportError);
  };

  if (task.type === "done") {
    return <Done session={session} onClose={onClose} />;
  }

  const onDone = async (result: TaskResult) => {
    // The session decides how much of the time counts and keeps the statistics.
    const counted = session.complete(task, result, Date.now() - run.startedAt);

    await addStudyTime(counted);
    await forgetFinishedChoice();
    setRun(nextRun(session, run.count + 1, Date.now()));
  };

  const block = blockOf(task);

  return (
    <TaskScreen
      key={run.count}
      task={task}
      frame={{
        block,
        label: `${minutesLeft(session)} min left`,
        onClose,
        progress: session.progress,
        title: BLOCK_TITLE[block],
      }}
      onDone={onDone}
    />
  );
};

export const Route = createFileRoute("/session")({
  component: SessionPage,
  validateSearch: (search) => ({
    minutes: sessionMinutes(Number(search.minutes)),
  }),
});
