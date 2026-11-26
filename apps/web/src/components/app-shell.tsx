// The page frame of the app: the shell of the design system, told about the router, the account and the courses.
import { courses } from "@norsk/courses";
import { Shell } from "@norsk/ui";
import type {
  ShellCourse,
  ShellDestination,
  ShellLinkProps,
  ShellWidth,
} from "@norsk/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Ear, Library, Sun, Waypoints } from "lucide-react";
import type { ReactNode } from "react";

import { useCourse } from "../course";
import { useSyncStatus } from "../learner";

/** The pages of a course, by the address of its first page, such as "/no". */
const destinationsOf = (home: string): readonly ShellDestination[] => [
  { exact: true, icon: Sun, label: "Today", to: home },
  { icon: Waypoints, label: "Map", to: `${home}/map` },
  { icon: BookOpen, label: "Stories", to: `${home}/stories` },
  { icon: Ear, label: "Sounds", to: `${home}/sounds` },
  { icon: Library, label: "Items", to: `${home}/items` },
];

/** Every course of the app, as the sidebar lists them. */
const COURSES: readonly ShellCourse[] = courses.map((meta) => ({
  flag: meta.flag,
  id: meta.id,
  label: meta.name,
  to: `/${meta.id}`,
}));

/** How the shell gets a link of the router. */
const ShellLink = ({ to, children, ...rest }: ShellLinkProps) => (
  <Link to={to} {...rest}>
    {children}
  </Link>
);

interface AppShellProps {
  children: ReactNode;
  /** Width of the content column on a wide screen. */
  width?: ShellWidth;
  /** The page fills the window and scrolls inside its own parts, instead of scrolling as a whole. */
  fill?: boolean;
}

export const AppShell = ({ children, width, fill }: AppShellProps) => {
  const currentPath = useRouterState({
    select: (state) => state.location.pathname,
  });

  const { account } = useSyncStatus();
  const { id, wordmark } = useCourse().meta;
  const home = `/${id}`;

  return (
    <Shell
      name={wordmark}
      courses={COURSES}
      course={id}
      destinations={destinationsOf(home)}
      settingsTo={`${home}/settings`}
      currentPath={currentPath}
      account={account}
      link={ShellLink}
      {...(width === undefined ? {} : { width })}
      {...(fill === undefined ? {} : { fill })}
    >
      {children}
    </Shell>
  );
};
