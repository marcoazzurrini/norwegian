import type { Course, Lesson, Level, Story } from "@norsk/course";
import { itemState, lessonState, nextLesson, storyReady } from "@norsk/engine";
import type { LessonState, Memory } from "@norsk/engine";
import {
  Blob,
  Button,
  Card,
  GroupLabel,
  Progress,
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

import { CoursePage } from "../../components/course-page";
import { useLevel } from "../../components/level-switch";
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

/** The graph is made smaller to fit the width of its frame, but never below this, so its names stay readable. */
const MIN_ZOOM = 0.6;

const styles = stylex.create({
  // The states of the lessons, at the end of the row of tabs. On a phone there is no room for them.
  legend: {
    alignContent: "center",
    alignItems: "center",
    display: { default: "none", [stylex.env.desktop]: "flex" },
    flexWrap: "wrap",
    gap: "0.625rem",
    justifyContent: "flex-end",
    minWidth: 0,
  },
  columns: {
    display: "grid",
    flexBasis: { default: null, [stylex.env.desktop]: "0%" },
    flexGrow: { default: null, [stylex.env.desktop]: 1 },
    flexShrink: { default: null, [stylex.env.desktop]: 1 },
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 30rem",
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
  graph: (width: number, height: number, zoom: number) => ({
    height: `${height}rem`,
    margin: "auto",
    position: "relative",
    width: `${width}rem`,
    zoom,
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
  // How much of the lesson is learned, with its state at the end. On a phone the state sits beside the title instead.
  meter: {
    alignItems: "center",
    display: "flex",
    gap: "0.875rem",
    paddingBottom: { default: "0.25rem", [stylex.env.desktop]: "0.75rem" },
  },
  meterBar: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  stateWide: {
    display: { default: "none", [stylex.env.desktop]: "inline-flex" },
  },
  gloss: {
    color: color.fg2,
    paddingLeft: "0.5rem",
  },
  story: {
    alignItems: "center",
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    color: color.fg,
    display: "flex",
    gap: "0.875rem",
    paddingBlock: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    textDecoration: "none",
  },
  storyBlob: {
    height: "2.25rem",
    width: "2.25rem",
  },
  storyText: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  storyTitle: {
    display: "block",
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    fontWeight: 500,
  },
  storyBase: {
    color: color.fg2,
    display: "block",
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s15 },
    lineHeight: 1.4,
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
    fontWeight: 500,
    minWidth: 0,
  },
  unlocks: {
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

interface TaughtRowProps {
  id: string;
  memory: Memory;
}

/** One thing a lesson teaches: a word with its meaning, or a pattern by its name, and its state. */
const TaughtRow = ({ id, memory }: TaughtRowProps) => {
  const course = useCourse();
  const taught = course.item(id);
  const isPattern = taught.kind === "pattern";

  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.rowName)}>
        {isPattern ? taught.title : taught.display}
        {isPattern ? null : (
          <span {...stylex.props(styles.gloss)}>{taught.gloss}</span>
        )}
      </span>
      {isPattern ? (
        <Tag icon={Ruler}>Pattern</Tag>
      ) : (
        <Tag tone={ITEM_LOOK[itemState(course, taught, memory)].tone}>
          {ITEM_LOOK[itemState(course, taught, memory)].label}
        </Tag>
      )}
    </div>
  );
};

/** True if a line of the story uses one of these items, as a word or as part of a chunk. */
const usesAny = (story: Story, ids: ReadonlySet<string>): boolean =>
  story.lines.some((line) =>
    line.tokens.some(
      (token) =>
        (token.w !== undefined && ids.has(token.w)) ||
        (token.c !== undefined && ids.has(token.c))
    )
  );

interface StoryRowProps {
  story: Story;
  read: boolean;
}

const StoryRow = ({ story, read }: StoryRowProps) => {
  const course = useCourse();

  return (
    <Link
      to="/$course/stories/$id"
      params={{ course: course.meta.id, id: story.id }}
      {...stylex.props(effects.press, styles.story)}
    >
      <Blob kind="story" style={styles.storyBlob} />
      <span {...stylex.props(styles.storyText)}>
        <span {...stylex.props(styles.storyTitle)}>{story.title}</span>
        <span {...stylex.props(styles.storyBase)}>{story.titleBase}</span>
      </span>
      {read ? <Tag tone="good">Read</Tag> : <Tag tone="new">New</Tag>}
    </Link>
  );
};

interface DetailProps {
  lesson: Lesson;
  memory: Memory;
  chosen: number | null;
}

const Detail = ({ lesson, memory, chosen }: DetailProps) => {
  const course = useCourse();
  const { storiesDone } = useProgress();
  const state = lessonState(course, lesson, memory);
  const look = LESSON_LOOK[state];
  const unit = course.units[lesson.unit - 1];
  const unlocks = course.unlockedBy(lesson.index);
  const learned = lesson.items.filter((id) => memory.has(id)).length;

  const total = lesson.items.length;

  // The stories that use what this lesson teaches and that the learner can read now.
  const taught = new Set(lesson.items);

  const stories = course.stories.filter(
    (story) => usesAny(story, taught) && storyReady(story, memory)
  );

  return (
    <Card style={styles.detail}>
      <div {...stylex.props(styles.head)}>
        <Blob kind="map" style={styles.headBlob} />
        <div {...stylex.props(styles.headText)}>
          <h2 {...stylex.props(styles.title)}>{lesson.title}</h2>
          <p {...stylex.props(styles.unit)}>
            Unit {unit?.index}: {unit?.name} · {learned} of {total} learned
          </p>
        </div>
        <Tag tone={look.tone} style={styles.statePhone}>
          {look.label}
        </Tag>
      </div>
      <div {...stylex.props(styles.meter)}>
        <Progress
          value={total === 0 ? 0 : learned / total}
          tone="good"
          style={styles.meterBar}
        />
        <Tag tone={look.tone} style={styles.stateWide}>
          {look.label}
        </Tag>
      </div>
      <GroupLabel style={styles.firstLabel}>Teaches · {total}</GroupLabel>
      {lesson.items.map((id) => (
        <TaughtRow key={id} id={id} memory={memory} />
      ))}
      {stories.length > 0 ? (
        <>
          <GroupLabel style={styles.label}>
            Stories you can read · {stories.length}
          </GroupLabel>
          {stories.map((story) => (
            <StoryRow
              key={story.id}
              story={story}
              read={storiesDone.includes(story.id)}
            />
          ))}
        </>
      ) : null}
      {unlocks.length > 0 ? (
        <>
          <GroupLabel style={styles.label}>Unlocks</GroupLabel>
          <div {...stylex.props(styles.unlocks)}>
            {unlocks.map((unlocked) => (
              <Tag
                key={unlocked.index}
                tone={LESSON_LOOK[lessonState(course, unlocked, memory)].tone}
              >
                {unlocked.title}
              </Tag>
            ))}
          </div>
        </>
      ) : null}
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
  const [zoom, setZoom] = useState(1);

  // On a wide screen the graph is made smaller until it is as wide as its frame, and again when
  // the frame changes size. On a phone it keeps its size, and the learner moves it with a finger.
  useEffect(() => {
    const watch = new ResizeObserver(([entry]) => {
      if (entry === undefined || !desktop) {
        setZoom(1);

        return;
      }

      // The room inside the padding of the frame, and the width of the graph, both in pixels.
      const room = entry.contentRect.width;
      const { fontSize } = getComputedStyle(document.documentElement);
      const graph = width * Number(fontSize.replace("px", ""));

      setZoom(Math.min(1, Math.max(MIN_ZOOM, room / graph)));
    });

    if (scroller.current !== null) {
      watch.observe(scroller.current);
    }

    return () => {
      watch.disconnect();
    };
  }, [width, desktop]);

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
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- none is read here; a change of the layout, the level or the zoom is what asks for a new scroll position
  }, [desktop, level, zoom]);

  return (
    <CoursePage
      tab="map"
      fill
      level={level}
      memory={memory}
      onPickLevel={(id) => {
        const picked = course.levels.find((one) => one.id === id);

        pickLevel(id);

        if (picked !== undefined) {
          setSelected(
            startOf(course, picked, nextLesson(course, memory, chosenLesson))
          );
        }
      }}
      tool={
        <div {...stylex.props(styles.legend)}>
          {STATES.map((state) => (
            <Tag key={state} tone={LESSON_LOOK[state].tone}>
              {LESSON_LOOK[state].label}
            </Tag>
          ))}
        </div>
      }
    >
      <div {...stylex.props(styles.columns)}>
        <div
          ref={scroller}
          {...stylex.props(styles.scroller, effects.noScrollbar)}
        >
          <div {...stylex.props(styles.graph(width, height, zoom))}>
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
    </CoursePage>
  );
};

export const Route = createFileRoute("/$course/map")({ component: MapPage });
