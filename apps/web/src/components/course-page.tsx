// The Course: one page with three tabs, the map of the lessons, the stories and the items.
// Each tab has its own address, so a link or the back button opens the right one;
// this frame gives all three the same title, level switch and row of tabs.
import type { Level } from "@norsk/course";
import { lessonState, nextLesson } from "@norsk/engine";
import type { Memory } from "@norsk/engine";
import { PageTitle, effects } from "@norsk/ui";
import { color, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { BookOpen, Library, Waypoints } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useCourse } from "../course";
import { useProgress } from "../learner";
import { AppShell } from "./app-shell";
import { LevelSwitch } from "./level-switch";

export type CourseTab = "map" | "stories" | "items";

const TABS: readonly {
  id: CourseTab;
  label: string;
  icon: LucideIcon;
  to: "/$course/map" | "/$course/stories" | "/$course/items";
}[] = [
  { icon: Waypoints, id: "map", label: "Map", to: "/$course/map" },
  { icon: BookOpen, id: "stories", label: "Stories", to: "/$course/stories" },
  { icon: Library, id: "items", label: "Items", to: "/$course/items" },
];

const styles = stylex.create({
  head: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
  },
  // The tabs, with the tool of the open tab at the other end. On a phone the tool goes under them.
  bar: {
    alignItems: { default: "stretch", [stylex.env.desktop]: "center" },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.5rem" },
    justifyContent: "space-between",
  },
  tabs: {
    borderBottomWidth: 1,
    borderColor: color.line,
    borderStyle: "solid",
    borderWidth: 0,
    display: "flex",
    flexShrink: 0,
    gap: { default: "1.5rem", [stylex.env.desktop]: "2.5rem" },
  },
  // On a wide screen the line under the tabs runs under the tool as well.
  barLine: {
    borderBottomWidth: { default: null, [stylex.env.desktop]: 1 },
    borderColor: color.line,
    borderStyle: "solid",
    borderWidth: 0,
  },
  tabsInBar: {
    borderBottomWidth: { default: 1, [stylex.env.desktop]: 0 },
  },
  tab: {
    alignItems: "center",
    boxShadow: "none",
    color: color.fg3,
    display: "flex",
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s20 },
    fontWeight: 500,
    gap: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    height: { default: "3rem", [stylex.env.desktop]: "4rem" },
    marginBottom: "-1px",
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  // The open tab is underlined with a line of its own colour.
  tabOpen: {
    boxShadow: `inset 0 -2px 0 ${color.fg}`,
    color: color.fg,
  },
  tabIcon: {
    flexShrink: 0,
    height: { default: "1.125rem", [stylex.env.desktop]: "1.25rem" },
    width: { default: "1.125rem", [stylex.env.desktop]: "1.25rem" },
  },
  count: {
    backgroundColor: color.control,
    borderRadius: "999px",
    color: color.fg3,
    display: { default: "none", [stylex.env.desktop]: "inline" },
    fontSize: text.s14,
    fontWeight: 500,
    marginLeft: "0.125rem",
    paddingBlock: "0.1875rem",
    paddingInline: "0.625rem",
  },
});

interface CoursePageProps {
  tab: CourseTab;
  level: Level;
  memory: Memory;
  onPickLevel: (id: string) => void;
  /** What the open tab adds at the end of the row of tabs, such as a search field. */
  tool?: ReactNode;
  /** The page fills the window and scrolls inside its own parts. The Map does. */
  fill?: boolean;
  children: ReactNode;
}

export const CoursePage = ({
  tab,
  level,
  memory,
  onPickLevel,
  tool,
  fill,
  children,
}: CoursePageProps) => {
  const course = useCourse();
  const { chosenLesson, storiesDone } = useProgress();

  const lessons = course.levelLessons(level);

  const lessonsDone = lessons.filter(
    (lesson) => lessonState(course, lesson, memory) === "done"
  ).length;

  const stories = course.stories.filter((story) =>
    level.units.includes(story.unit)
  );

  const storiesRead = stories.filter((story) =>
    storiesDone.includes(story.id)
  ).length;

  const taught = course.levelItems(level);
  const learned = taught.filter((id) => memory.has(id)).length;

  // The unit of the lesson that comes next, while it is in the level that is showing.
  const next = nextLesson(course, memory, chosenLesson);

  const unit =
    next !== null && level.units.includes(next.unit)
      ? course.units[next.unit - 1]
      : undefined;

  const where = unit === undefined ? "" : `Unit ${unit.index}: ${unit.name} · `;

  const counts: Record<CourseTab, string> = {
    items: `${learned} learned`,
    map: `${lessonsDone} of ${lessons.length} learned`,
    stories: `${storiesRead} of ${stories.length} read`,
  };

  return (
    <AppShell width="wide" {...(fill === undefined ? {} : { fill })}>
      <div {...stylex.props(styles.head)}>
        <PageTitle
          title="Course"
          sub={`${where}${learned} of ${taught.length} learned in ${level.id}.`}
        >
          <LevelSwitch level={level} memory={memory} onPick={onPickLevel} />
        </PageTitle>
        <div {...stylex.props(styles.bar, styles.barLine)}>
          <nav
            aria-label="Course"
            {...stylex.props(styles.tabs, styles.tabsInBar)}
          >
            {TABS.map(({ id, label, icon: Icon, to }) => {
              const open = id === tab;

              return (
                <Link
                  key={id}
                  to={to}
                  params={{ course: course.meta.id }}
                  aria-current={open ? "page" : undefined}
                  {...stylex.props(
                    effects.press,
                    styles.tab,
                    open && styles.tabOpen
                  )}
                >
                  <Icon aria-hidden {...stylex.props(styles.tabIcon)} />
                  {label}
                  <span {...stylex.props(styles.count)}>{counts[id]}</span>
                </Link>
              );
            })}
          </nav>
          {tool}
        </div>
      </div>
      {children}
    </AppShell>
  );
};
