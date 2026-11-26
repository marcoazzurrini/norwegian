import { Blob, Card, Chip, Progress, Segmented, buttonStyle } from "@norsk/ui";
import type { BlobKind } from "@norsk/ui";
import {
  color,
  display,
  radius,
  text,
  tracking,
} from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Lock, Play } from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "../../components/app-shell";
import { greetingAt, todayOf } from "../../components/today-plan";
import type { LevelStep } from "../../components/today-plan";
import { useCourse } from "../../course";
import {
  learner,
  useMemory,
  useProgress,
  useScheduler,
  useSettings,
} from "../../learner";

const LENGTHS = [5, 15, 25, 40] as const;

const LENGTH_OPTIONS = LENGTHS.map(
  (minutes) => [minutes, `${minutes} min`] as const
);

/** Sounds and a story are only part of a session of at least this many minutes. */
const MIN_MINUTES_FOR_EXTRAS = 15;

const styles = stylex.create({
  hero: {
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.625rem" },
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "3rem" },
    textAlign: "center",
  },
  greeting: {
    fontSize: display.hero,
    fontWeight: 500,
    letterSpacing: tracking.tighter,
    lineHeight: 1,
    margin: 0,
  },
  summary: {
    "::first-letter": { textTransform: "uppercase" },
    color: color.fg2,
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s22 },
    margin: 0,
  },
  actions: {
    alignItems: "center",
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: "0.75rem",
    paddingTop: { default: "0.5rem", [stylex.env.desktop]: "0.75rem" },
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  start: {
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  startIcon: {
    height: "1.125rem",
    width: "1.125rem",
  },
  columns: {
    alignItems: "start",
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 28.75rem",
    },
    paddingTop: { default: null, [stylex.env.desktop]: "1.75rem" },
  },
  plan: {
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r22, [stylex.env.desktop]: radius.r28 },
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    padding: { default: "0.375rem", [stylex.env.desktop]: "0.625rem" },
  },
  planRow: {
    alignItems: "center",
    display: "flex",
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
    paddingBlock: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    paddingInline: { default: "0.625rem", [stylex.env.desktop]: "1rem" },
  },
  planBlob: {
    height: { default: "2.75rem", [stylex.env.desktop]: "3.25rem" },
    width: { default: "2.75rem", [stylex.env.desktop]: "3.25rem" },
  },
  planText: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  planTitle: {
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    fontWeight: 500,
  },
  planDetail: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
  },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  // The levels of the course side by side, above the progress of the one the learner is in.
  steps: {
    borderBottomWidth: 1,
    borderColor: color.line,
    borderStyle: "solid",
    borderWidth: 0,
    display: "flex",
    gap: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    marginBottom: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
    paddingBottom: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
  },
  step: {
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    gap: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    minWidth: 0,
  },
  stepBar: {
    height: { default: "0.25rem", [stylex.env.desktop]: "0.3125rem" },
  },
  stepLabel: {
    alignItems: "center",
    color: color.fg2,
    display: "flex",
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s16 },
    gap: "0.375rem",
    lineHeight: 1.3,
  },
  stepName: {
    color: color.fg,
    fontWeight: 600,
  },
  stepLocked: {
    color: color.fg3,
  },
  stepMark: {
    flexShrink: 0,
    height: "0.875rem",
    width: "0.875rem",
  },
  stepDone: {
    color: color.green,
  },
  cardTitle: {
    color: color.fg2,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
  },
  figure: {
    fontSize: { default: text.s30, [stylex.env.desktop]: text.s44 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
  },
  figureLower: {
    paddingTop: "0.5rem",
  },
  caption: {
    color: color.fg3,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    lineHeight: 1.45,
  },
  meter: {
    paddingTop: "0.875rem",
  },
  // The items of the level, under its progress and set apart by a hairline, as the levels are above it.
  items: {
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    marginTop: { default: "1.125rem", [stylex.env.desktop]: "1.625rem" },
    paddingTop: { default: "1rem", [stylex.env.desktop]: "1.375rem" },
  },
  stats: {
    display: "flex",
    gap: { default: "2rem", [stylex.env.desktop]: "2.5rem" },
    paddingTop: "0.5rem",
  },
});

interface PlanRowProps {
  kind: BlobKind;
  title: string;
  detail: string;
}

const PlanRow = ({ kind, title, detail }: PlanRowProps) => (
  <div {...stylex.props(styles.planRow)}>
    <Blob kind={kind} style={styles.planBlob} />
    <div {...stylex.props(styles.planText)}>
      <div {...stylex.props(styles.planTitle)}>{title}</div>
      <div {...stylex.props(styles.planDetail)}>{detail}</div>
    </div>
  </div>
);

interface StatProps {
  value: string | number;
  label: string;
}

const Stat = ({ value, label }: StatProps) => (
  <div>
    <div {...stylex.props(styles.figure)}>{value}</div>
    <div {...stylex.props(styles.caption)}>{label}</div>
  </div>
);

interface LevelStepsProps {
  steps: LevelStep[];
  /** The id of the level the learner is in. */
  current: string;
}

/** Every level with a small bar: done, the one being learned, and the locked ones after it. */
const LevelSteps = ({ steps, current }: LevelStepsProps) => (
  <div {...stylex.props(styles.steps)}>
    {steps.map((step) => {
      const locked = step.state === "locked";

      return (
        <div key={step.id} {...stylex.props(styles.step)}>
          <Progress value={step.progress} tone="good" style={styles.stepBar} />
          <div {...stylex.props(styles.stepLabel)}>
            <span
              {...stylex.props(styles.stepName, locked && styles.stepLocked)}
            >
              {step.id}
            </span>
            {step.state === "done" ? (
              <>
                <Check
                  aria-hidden
                  {...stylex.props(styles.stepMark, styles.stepDone)}
                />
                Done
              </>
            ) : null}
            {locked ? (
              <Lock
                aria-label="Locked"
                {...stylex.props(styles.stepMark, styles.stepLocked)}
              />
            ) : null}
            {step.id === current && step.state === "open" ? "Now" : null}
          </div>
        </div>
      );
    })}
  </div>
);

const Today = () => {
  const memory = useMemory();
  const progress = useProgress();
  const scheduler = useScheduler();
  const { minutes } = useSettings();
  const { openedAt: now } = Route.useLoaderData();
  const course = useCourse();
  const greeting = greetingAt(new Date(now).getHours(), course.meta.greetings);

  const view = useMemo(
    () =>
      todayOf({
        chosenLesson: progress.chosenLesson,
        course,
        memory,
        now,
        scheduler,
        sentenceSeen: progress.sentenceSeen,
        storiesDone: progress.storiesDone,
      }),
    [
      course,
      memory,
      now,
      progress.chosenLesson,
      progress.sentenceSeen,
      progress.storiesDone,
      scheduler,
    ]
  );

  const extras = minutes >= MIN_MINUTES_FOR_EXTRAS;

  return (
    <AppShell>
      <div {...stylex.props(styles.hero)}>
        <Chip strong={`${greeting.base}.`}>
          {progress.days.length > 0 ? `Day ${progress.days.length}` : undefined}
        </Chip>
        <h1 {...stylex.props(styles.greeting)}>{greeting.target}</h1>
        <p {...stylex.props(styles.summary)}>{view.summary}</p>
        <div {...stylex.props(styles.actions)}>
          <Link
            to="/$course/session"
            params={{ course: course.meta.id }}
            search={{ minutes }}
            {...stylex.props(buttonStyle("primary", "large"), styles.start)}
          >
            <Play {...stylex.props(styles.startIcon)} />
            Start session
          </Link>
          <Segmented
            large
            label="Session length"
            value={minutes}
            options={LENGTH_OPTIONS}
            onPick={(picked) => {
              learner().updateSettings({ minutes: picked }).catch(reportError);
            }}
          />
        </div>
      </div>

      <div {...stylex.props(styles.columns)}>
        <div {...stylex.props(styles.plan)}>
          {extras ? (
            <PlanRow
              kind="sounds"
              title="Sounds"
              detail="Two similar words. Which one do you hear?"
            />
          ) : null}
          <PlanRow kind="review" title="Review" detail={view.reviewDetail} />
          <PlanRow kind="new" title="New" detail={view.newDetail} />
          {extras ? (
            <PlanRow kind="story" title="Story" detail={view.storyDetail} />
          ) : null}
        </div>

        <div {...stylex.props(styles.cards)}>
          <Card>
            <LevelSteps steps={view.levels} current={view.level.id} />
            <div {...stylex.props(styles.cardTitle)}>
              Progress to {view.level.id}
            </div>
            <div {...stylex.props(styles.figure, styles.figureLower)}>
              {Math.round(view.progress * 100)}%
            </div>
            <div {...stylex.props(styles.meter)}>
              <Progress
                value={view.progress}
                reach={view.seen / view.total}
                tone="good"
              />
            </div>
            <div {...stylex.props(styles.items)}>
              <div {...stylex.props(styles.cardTitle)}>Items</div>
              <div {...stylex.props(styles.stats)}>
                <Stat value={view.stable} label="Stable" />
                <Stat value={view.learning} label="Learning" />
                <Stat value={view.toLearn} label="To learn" />
              </div>
            </div>
          </Card>
          <Card>
            <div {...stylex.props(styles.cardTitle)}>Memory</div>
            <div {...stylex.props(styles.figureLower)}>
              <Stat
                value={view.recall}
                label="of learned items you would recall right now"
              />
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/$course/")({
  component: Today,
  // The moment the page is opened: what is due is counted from it.
  loader: () => ({ openedAt: Date.now() }),
});
