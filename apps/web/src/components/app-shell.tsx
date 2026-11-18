// The page frame of the app: the shell of the design system, told about the router and the account.
import { Shell } from "@norsk/ui";
import type { ShellDestination, ShellLinkProps, ShellWidth } from "@norsk/ui";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Ear, Library, Sun, Waypoints } from "lucide-react";
import type { ReactNode } from "react";

import { useSyncStatus } from "../learner";

const DESTINATIONS: readonly ShellDestination[] = [
  { icon: Sun, label: "Today", to: "/" },
  { icon: Waypoints, label: "Map", to: "/map" },
  { icon: BookOpen, label: "Stories", to: "/stories" },
  { icon: Ear, label: "Sounds", to: "/sounds" },
  { icon: Library, label: "Items", to: "/items" },
];

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

  return (
    <Shell
      destinations={DESTINATIONS}
      settingsTo="/settings"
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
