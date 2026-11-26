import type { Course } from "@norsk/course";
import { Session, blockOf, lessonState } from "@norsk/engine";
import type { Task, TaskResult } from "@norsk/engine";
import { Card, Chip, Focus, buttonStyle, effects } from "@norsk/ui";
import { color, display, text, tracking } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  minutesLeft,
  sessionMinutes,
  summaryOf,
} from "../../components/session-summary";
import { TaskScreen } from "../../components/tasks/task-screen";
import { useCourse } from "../../course";
import { noteSessionLeft, noteTaskChosen, noteTaskDone } from "../../journal";
import { learner } from "../../learner";
import { stopSpeaking } from "../../speech";

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
  /** The progress the last task showed. */
  progressFrom: number;
  onClose: () => void;
}

/** The end of a session: what was done in it. */
const Done = ({ session, progressFrom, onClose }: DoneProps) => {
  const course = useCourse();
  const { spent, closing, tiles, taughtNew } = summaryOf(session);
  const days = learner().progress().days.length;

  return (
    <Focus
      block="recall"
      title="Done"
      label={`${spent} min`}
      progress={1}
      progressFrom={progressFrom}
      onClose={onClose}
      wide
      dock={
        <div {...stylex.props(styles.dock)}>
          <Link
            to="/$course"
            params={{ course: course.meta.id }}
            {...stylex.props(buttonStyle("primary", "large"), styles.back)}
          >
            Back to Today
          </Link>
        </div>
      }
    >
      <div {...stylex.props(effects.rise, styles.hero)}>
        <Chip strong="Session complete.">
          {days > 0 ? `Day ${days}` : undefined}
        </Chip>
        <h1 {...stylex.props(styles.done)}>{course.meta.greetings.done}</h1>
        <p {...stylex.props(styles.closing)}>{closing}</p>
      </div>
      <div {...stylex.props(styles.tiles)}>
        {tiles.map((tile, place) => (
          <Card
            key={tile.label}
            style={[effects.rise, effects.after(place + 1), styles.tile]}
          >
            <div {...stylex.props(styles.tileValue)}>{tile.value}</div>
            <div {...stylex.props(styles.tileLabel)}>{tile.label}</div>
          </Card>
        ))}
      </div>
      {taughtNew ? (
        <p
          {...stylex.props(
            effects.rise,
            effects.after(tiles.length + 1),
            styles.note
          )}
        >
          New items come back within minutes at first. Open the app again later
          today, or tomorrow.
        </p>
      ) : null}
    </Focus>
  );
};

/** A lesson picked on the Map stops being "chosen" once it is finished. */
const forgetFinishedChoice = async (course: Course) => {
  const { chosenLesson } = learner().progress();

  const chosen =
    chosenLesson === null ? undefined : course.lessons[chosenLesson];

  if (
    chosen !== undefined &&
    lessonState(course, chosen, learner().memory()) === "done"
  ) {
    await learner().chooseLesson(null);
  }
};

/** A session under way: the task on screen, and when it was put there. */
interface Run {
  session: Session;
  task: Task;
  /** How many tasks the session has shown. Each task gets a fresh screen. */
  count: number;
  startedAt: number;
  /** The progress the screen before showed. Each task has its own bar, which fills from here. */
  progressFrom: number;
}

/** Asks the session for its next task, given what the learner knows at this moment. */
const nextRun = (
  session: Session,
  count: number,
  now: number,
  progressFrom: number
): Run => {
  const { chosenLesson, sentenceSeen, sounds, storiesDone } =
    learner().progress();

  const task = session.next(
    {
      chosenLesson,
      memory: learner().memory(),
      sentenceSeen,
      soundStats: sounds,
      storiesDone: new Set(storiesDone),
    },
    now
  );

  return { count, progressFrom, session, startedAt: now, task };
};

/** A new session, planned with how long this learner's tasks took before, and its first task. */
const firstRun = (course: Course, minutes: number): Run =>
  nextRun(
    new Session(course, minutes, Math.random, learner().progress().pace),
    1,
    Date.now(),
    0
  );

const SessionPage = () => {
  const { minutes } = Route.useSearch();
  const navigate = useNavigate();

  const course = useCourse();
  const [run, setRun] = useState(() => firstRun(course, minutes));

  const { session, task } = run;

  // Each task is noted once it is on screen, with the reason the session chose it.
  useEffect(() => {
    noteTaskChosen(course.meta.id, run.session, run.count, run.task);
  }, [course, run]);

  useEffect(
    () => () => {
      stopSpeaking();
    },
    []
  );

  const onClose = () => {
    navigate({ params: { course: course.meta.id }, to: "/$course" }).catch(
      reportError
    );
  };

  if (task.type === "done") {
    return (
      <Done
        session={session}
        progressFrom={run.progressFrom}
        onClose={onClose}
      />
    );
  }

  const onDone = async (result: TaskResult) => {
    // The session decides how much of the time counts and keeps the statistics.
    const ms = Date.now() - run.startedAt;
    const progressFrom = session.progress;
    const counted = session.complete(task, result, ms);

    noteTaskDone(run.count, result, ms, counted);

    await learner().addStudyTime(counted);
    await learner().savePace(session.pace);
    await forgetFinishedChoice(course);
    setRun(nextRun(session, run.count + 1, Date.now(), progressFrom));
  };

  const block = blockOf(task);

  return (
    <TaskScreen
      key={run.count}
      task={task}
      frame={{
        // The end of a session: what was taught or missed in it comes back once more.
        block: session.closing ? "recall" : block,
        label: `${minutesLeft(session)} min left`,
        onClose,
        progress: session.progress,
        progressFrom: run.progressFrom,
        title: session.closing ? "Recall again" : BLOCK_TITLE[block],
      }}
      onDone={onDone}
    />
  );
};

export const Route = createFileRoute("/$course/session")({
  component: SessionPage,
  onLeave: noteSessionLeft,
  validateSearch: (search) => ({
    minutes: sessionMinutes(Number(search.minutes)),
  }),
});
