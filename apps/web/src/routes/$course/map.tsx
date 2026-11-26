import type { Course, Lesson, Level } from "@norsk/course";
import { itemState, lessonState, nextLesson } from "@norsk/engine";
import type { LessonState, Memory } from "@norsk/engine";
import {
  Blob,
  Button,
  Card,
  GroupLabel,
  PageTitle,
  Tag,
  buttonStyle,
  effects,
  useDesktop,
} from "@norsk/ui";
import { color, radius, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, CircleDashed, Lock, Ruler, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { LevelSwitch, useLevel } from "../../components/level-switch";
import { ITEM_LOOK, LESSON_LOOK } from "../../components/looks";
import { MAP_SIZES, layoutMap } from "../../components/map-layout";
import { useCourse } from "../../course";
import { learner, useMemory, useProgress } from "../../learner";

const STATES = ["done", "started", "ready", "locked"] as const;

const ICON: Record<LessonState, LucideIcon> = {
  done: Check,
  locked: Lock,
  ready: Sparkles,
  started: CircleDashed,
};

/** The router restores its own scroll position first; the Map waits this long before it sets its own. */
const SCROLL_DELAY_MS = 150;

const styles = stylex.create({
  // The same two columns as the content below, so that the level switch ends where the graph ends.
  titleRow: {
    display: { default: "flex", [stylex.env.desktop]: "grid" },
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 32.5rem",
    },
  },
  // As tall as the level switch, so the two share one centre line.
  legend: {
    alignContent: "center",
    alignItems: "center",
    display: { default: "none", [stylex.env.desktop]: "flex" },
    flexWrap: "wrap",
    gap: "0.625rem",
    justifyContent: "flex-end",
    minHeight: "3.25rem",
  },
  columns: {
    display: "grid",
    flexBasis: { default: null, [stylex.env.desktop]: "0%" },
    flexGrow: { default: null, [stylex.env.desktop]: 1 },
    flexShrink: { default: null, [stylex.env.desktop]: 1 },
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 32.5rem",
    },
    gridTemplateRows: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr)",
    },
    minHeight: { default: null, [stylex.env.desktop]: 0 },
  },
  scroller: {
    backgroundColor: color.inset,
    borderColor: color.line,
    borderRadius: { default: radius.r20, [stylex.env.desktop]: radius.r32 },
    borderStyle: "solid",
    borderWidth: 1,
    height: { default: "18.75rem", [stylex.env.desktop]: "auto" },
    overflow: "auto",
    padding: { default: "1.25rem", [stylex.env.desktop]: "2rem" },
  },
  // Lengths are in rem; the SVG uses the same numbers as its own course.units.
  graph: (width: number, height: number) => ({
    height: `${height}rem`,
    margin: "auto",
    position: "relative",
    width: `${width}rem`,
  }),
  curves: {
    height: "100%",
    inset: 0,
    position: "absolute",
    width: "100%",
  },
  node: (x: number, y: number, height: number, maxWidth: number) => ({
    alignItems: "center",
    borderRadius: radius.pill,
    display: "inline-flex",
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s17 },
    fontWeight: 500,
    gap: { default: "0.4375rem", [stylex.env.desktop]: "0.625rem" },
    height: `${height}rem`,
    left: `${x}rem`,
    maxWidth: `${maxWidth}rem`,
    paddingLeft: { default: "0.6875rem", [stylex.env.desktop]: "1rem" },
    paddingRight: { default: "0.875rem", [stylex.env.desktop]: "1.375rem" },
    position: "absolute",
    top: `${y}rem`,
    translate: "-50% 0",
    whiteSpace: "nowrap",
  }),
  nodeChosen: {
    backgroundColor: color.inverse,
    borderWidth: 0,
    color: color.onInverse,
  },
  nodeLocked: {
    backgroundColor: color.inset,
    borderColor: color.strong,
    borderStyle: "dashed",
    borderWidth: 1,
    color: color.fg2,
  },
  nodeOpen: {
    backgroundColor: color.raised,
    borderWidth: 0,
    color: color.fg,
  },
  nodeIcon: {
    flexShrink: 0,
    height: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
    width: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
  },
  nodeName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  side: {
    minHeight: { default: null, [stylex.env.desktop]: 0 },
  },
  detail: {
    height: { default: null, [stylex.env.desktop]: "100%" },
    overflowY: { default: null, [stylex.env.desktop]: "auto" },
    padding: { default: "1.125rem", [stylex.env.desktop]: "2rem" },
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
    paddingBottom: { default: "0.875rem", [stylex.env.desktop]: "1.5rem" },
  },
  headBlob: {
    height: { default: "2.75rem", [stylex.env.desktop]: "4rem" },
    width: { default: "2.75rem", [stylex.env.desktop]: "4rem" },
  },
  headText: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontSize: { default: text.s20, [stylex.env.desktop]: text.s28 },
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
    margin: 0,
  },
  unit: {
    color: color.fg2,
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s18 },
    margin: 0,
  },
  // The state sits beside the title on a phone and under it on a wide screen.
  statePhone: {
    display: { default: "inline-flex", [stylex.env.desktop]: "none" },
  },
  stateWide: {
    display: { default: "none", [stylex.env.desktop]: "flex" },
    paddingBottom: "0.5rem",
  },
  firstLabel: {
    paddingBlock: "0.5rem",
  },
  label: {
    paddingBottom: "0.5rem",
    paddingTop: { default: "1rem", [stylex.env.desktop]: "1.75rem" },
  },
  row: {
    alignItems: "center",
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    display: "flex",
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    gap: "0.75rem",
    justifyContent: "space-between",
    paddingBlock: { default: "0.6875rem", [stylex.env.desktop]: "1rem" },
  },
  rowName: {
    minWidth: 0,
  },
  teaches: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
    paddingTop: "0.25rem",
  },
  spacer: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: { default: "0.875rem", [stylex.env.desktop]: "1rem" },
  },
  chosen: {
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
  },
  chosenNote: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    textAlign: "center",
  },
  full: {
    width: "100%",
  },
});

const iconTones = stylex.create({
  done: { color: color.green },
  locked: { color: color.fg3 },
  ready: { color: color.violet },
  started: { color: color.orange },
});

interface LessonRowProps {
  lesson: Lesson;
  memory: Memory;
}

const LessonRow = ({ lesson, memory }: LessonRowProps) => {
  const course = useCourse();
  const look = LESSON_LOOK[lessonState(course, lesson, memory)];

  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.rowName)}>{lesson.title}</span>
      <Tag tone={look.tone}>{look.label}</Tag>
    </div>
  );
};

interface TaughtProps {
  id: string;
  memory: Memory;
}

/** One thing a lesson teaches: a pattern by its name, a word with its state. */
const Taught = ({ id, memory }: TaughtProps) => {
  const course = useCourse();
  const taught = course.item(id);

  return taught.kind === "pattern" ? (
    <Tag icon={Ruler}>{taught.title}</Tag>
  ) : (
    <Tag tone={ITEM_LOOK[itemState(course, taught, memory)].tone}>
      {taught.text}
    </Tag>
  );
};

interface DetailProps {
  lesson: Lesson;
  memory: Memory;
  chosen: number | null;
}

const Detail = ({ lesson, memory, chosen }: DetailProps) => {
  const course = useCourse();
  const state = lessonState(course, lesson, memory);
  const look = LESSON_LOOK[state];
  const unit = course.units[lesson.unit - 1];
  const needs = lesson.needs.flatMap((need) => course.lessons[need] ?? []);
  const unlocks = course.unlockedBy(lesson.index);

  return (
    <Card style={styles.detail}>
      <div {...stylex.props(styles.head)}>
        <Blob kind="map" style={styles.headBlob} />
        <div {...stylex.props(styles.headText)}>
          <h2 {...stylex.props(styles.title)}>{lesson.title}</h2>
          <p {...stylex.props(styles.unit)}>
            Unit {unit?.index}: {unit?.name}
          </p>
        </div>
        <Tag tone={look.tone} style={styles.statePhone}>
          {look.label}
        </Tag>
      </div>
      <div {...stylex.props(styles.stateWide)}>
        <Tag tone={look.tone}>{look.label}</Tag>
      </div>
      {needs.length > 0 ? (
        <>
          <GroupLabel style={styles.firstLabel}>Needs</GroupLabel>
          {needs.map((need) => (
            <LessonRow key={need.index} lesson={need} memory={memory} />
          ))}
        </>
      ) : null}
      {unlocks.length > 0 ? (
        <>
          <GroupLabel style={styles.label}>Unlocks</GroupLabel>
          {unlocks.map((unlocked) => (
            <LessonRow key={unlocked.index} lesson={unlocked} memory={memory} />
          ))}
        </>
      ) : null}
      <GroupLabel style={styles.label}>Teaches</GroupLabel>
      <div {...stylex.props(styles.teaches)}>
        {lesson.items.map((id) => (
          <Taught key={id} id={id} memory={memory} />
        ))}
      </div>
      {state === "ready" ? (
        <>
          <div {...stylex.props(styles.spacer)} />
          {chosen === lesson.index ? (
            <div {...stylex.props(styles.chosen)}>
              <span {...stylex.props(styles.chosenNote)}>
                This lesson is next.
              </span>
              <Link
                to="/$course"
                params={{ course: course.meta.id }}
                {...stylex.props(buttonStyle("primary", "large"), styles.full)}
              >
                Go to Today
              </Link>
            </div>
          ) : (
            <Button
              style={styles.full}
              onClick={() => {
                learner().chooseLesson(lesson.index).catch(reportError);
              }}
            >
              Learn this next
            </Button>
          )}
        </>
      ) : null}
    </Card>
  );
};

/** Scrolls the frame so that the chosen lesson is in its middle. */
const centreChosen = (frame: HTMLElement | null) => {
  const chosen = frame?.querySelector<HTMLElement>('[aria-pressed="true"]');

  if (frame === null || chosen === null || chosen === undefined) {
    return;
  }

  const outer = frame.getBoundingClientRect();
  const inner = chosen.getBoundingClientRect();

  frame.scrollTo({
    left:
      frame.scrollLeft +
      inner.left -
      outer.left -
      (outer.width - inner.width) / 2,
    top:
      frame.scrollTop +
      inner.top -
      outer.top -
      (outer.height - inner.height) / 2,
  });
};

/** The lesson a level opens on: the one that comes next if it is in the level, or else its first. */
const startOf = (course: Course, level: Level, next: Lesson | null): number => {
  const shown = course.levelLessons(level);

  return next !== null && shown.includes(next)
    ? next.index
    : (shown[0]?.index ?? 0);
};

const MapPage = () => {
  const course = useCourse();
  const memory = useMemory();
  const { chosenLesson } = useProgress();
  const desktop = useDesktop();
  const size = desktop ? MAP_SIZES.desktop : MAP_SIZES.phone;
  const [level, pickLevel] = useLevel(memory);

  const { nodes, edges, width, height } = useMemo(
    () => layoutMap(course.levelLessons(level), size),
    [course, level, size]
  );

  const [selected, setSelected] = useState(() =>
    startOf(course, level, nextLesson(course, memory, chosenLesson))
  );

  const lesson = course.lessons[selected];
  const scroller = useRef<HTMLDivElement>(null);

  // The graph is larger than its frame: open it on the lesson that comes next, and again when
  // another level is picked or the layout changes between the phone and the wide one.
  useEffect(() => {
    // Wait until the router has restored its own scroll position, which would otherwise undo this.
    const wait = setTimeout(() => {
      centreChosen(scroller.current);
    }, SCROLL_DELAY_MS);

    return () => {
      clearTimeout(wait);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- neither is read here; a change of the layout or the level is what asks for a new scroll position
  }, [desktop, level]);

  return (
    <AppShell width="full" fill>
      <PageTitle
        title="Map"
        sub="What you know, and what it unlocks."
        style={styles.titleRow}
        aside={
          <div {...stylex.props(styles.legend)}>
            {STATES.map((state) => (
              <Tag key={state} tone={LESSON_LOOK[state].tone}>
                {LESSON_LOOK[state].label}
              </Tag>
            ))}
          </div>
        }
      >
        <LevelSwitch
          level={level}
          memory={memory}
          onPick={(id) => {
            const picked = course.levels.find((one) => one.id === id);

            pickLevel(id);

            if (picked !== undefined) {
              setSelected(
                startOf(
                  course,
                  picked,
                  nextLesson(course, memory, chosenLesson)
                )
              );
            }
          }}
        />
      </PageTitle>
      <div {...stylex.props(styles.columns)}>
        <div
          ref={scroller}
          {...stylex.props(styles.scroller, effects.noScrollbar)}
        >
          <div {...stylex.props(styles.graph(width, height))}>
            <svg
              viewBox={`0 0 ${width} ${height}`}
              aria-hidden
              {...stylex.props(styles.curves)}
            >
              {edges.map((edge) => {
                const near = edge.to === selected || edge.from === selected;

                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={edge.path}
                    fill="none"
                    stroke={near ? "#F2F2F2" : "#3A3A3A"}
                    strokeWidth={near ? 2 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </svg>
            {nodes.map((node) => {
              const state = lessonState(course, node.lesson, memory);
              const Icon = ICON[state];
              const on = node.lesson.index === selected;

              const rest =
                state === "locked" ? styles.nodeLocked : styles.nodeOpen;

              return (
                <button
                  key={node.lesson.index}
                  type="button"
                  onClick={() => {
                    setSelected(node.lesson.index);
                  }}
                  aria-pressed={on}
                  title={node.lesson.title}
                  {...stylex.props(
                    effects.press,
                    styles.node(node.x, node.y, size.node, size.slot),
                    on ? styles.nodeChosen : rest
                  )}
                >
                  <Icon
                    {...stylex.props(styles.nodeIcon, !on && iconTones[state])}
                  />
                  <span {...stylex.props(styles.nodeName)}>
                    {node.lesson.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div {...stylex.props(styles.side)}>
          {lesson === undefined ? null : (
            <Detail lesson={lesson} memory={memory} chosen={chosenLesson} />
          )}
        </div>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/$course/map")({ component: MapPage });
