// Page frame: a sidebar beside a rounded panel on a wide screen; a header and a floating tab bar on a phone.
// The name at the top is the course that is open. The sidebar lists every course above the account.
import * as stylex from "@stylexjs/stylex";
import { Check, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ComponentType, CSSProperties, ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, radius, text, tracking } from "../tokens/tokens.stylex";

/**
 * What the shell hands to the link component of the app. The shell does not know the router,
 * so the app supplies a component that turns these props into a real link, for example
 * `(props) => <Link {...props} />` with TanStack Router. Pass `className` and `style` through
 * unchanged: they carry the look.
 */
export interface ShellLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  /** Set on the link to the page that is showing. */
  "aria-current"?: "page";
}

export interface ShellDestination {
  to: string;
  label: string;
  icon: LucideIcon;
  /** The page is current only on its own path, not on the pages under it. For the first page of a course. */
  exact?: boolean;
  /** Other paths that belong to this destination, such as the other tabs of one page. */
  also?: readonly string[];
}

/** A course the learner can open from the list in the sidebar. */
export interface ShellCourse {
  id: string;
  /** The language, in the learner's own language: "Norwegian". */
  label: string;
  /** The flag shown in front of the label, as one emoji. */
  flag: string;
  /** The first page of the course. */
  to: string;
}

export type ShellWidth = "page" | "wide" | "narrow" | "full";

const SAFE_TOP = "calc(max(env(safe-area-inset-top), 0.5rem) + 0.375rem)";

const SAFE_BOTTOM =
  "max(0.875rem, calc(env(safe-area-inset-bottom) - 0.25rem))";

const styles = stylex.create({
  frame: {
    backgroundColor: { default: color.panel, [stylex.env.desktop]: color.base },
    display: "flex",
    flexDirection: { default: "column", [stylex.env.desktop]: "row" },
    height: { default: null, [stylex.env.desktop]: "100dvh" },
    minHeight: "100dvh",
    padding: { default: null, [stylex.env.desktop]: "0.625rem" },
  },
  sidebar: {
    display: { default: "none", [stylex.env.desktop]: "flex" },
    flexDirection: "column",
    flexShrink: 0,
    gap: "0.25rem",
    paddingBottom: "0.875rem",
    paddingInline: "0.875rem",
    paddingTop: "1.375rem",
    width: "18.75rem",
  },
  sidebarName: {
    fontSize: text.s26,
    fontWeight: 500,
    letterSpacing: tracking.tight,
    paddingBottom: "1.75rem",
    paddingInline: "0.875rem",
    paddingTop: "0.25rem",
  },
  courses: {
    borderBottomColor: color.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    marginBottom: "0.5rem",
    paddingBottom: "0.625rem",
  },
  coursesLabel: {
    color: color.fg3,
    fontSize: text.s12,
    fontWeight: 500,
    letterSpacing: "0.04em",
    paddingBottom: "0.5rem",
    paddingInline: "0.875rem",
    textTransform: "uppercase",
  },
  course: {
    alignItems: "center",
    borderRadius: radius.nav,
    color: color.fg2,
    display: "flex",
    fontSize: text.s16,
    gap: "0.875rem",
    height: "2.625rem",
    paddingInline: "0.875rem",
    textDecoration: "none",
  },
  courseCurrent: {
    color: color.fg,
    fontWeight: 500,
  },
  courseFlag: {
    flexShrink: 0,
    fontSize: text.s16,
    lineHeight: 1,
    textAlign: "center",
    width: "1.25rem",
  },
  courseFlagOther: {
    opacity: 0.6,
  },
  courseLabel: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  courseCheck: {
    color: color.fg2,
    flexShrink: 0,
    height: "1rem",
    width: "1rem",
  },
  sidebarLink: {
    alignItems: "center",
    borderRadius: radius.nav,
    color: color.fg2,
    display: "flex",
    fontSize: text.s16,
    gap: "0.875rem",
    height: "2.875rem",
    paddingInline: "0.875rem",
    textDecoration: "none",
  },
  sidebarLinkCurrent: {
    backgroundColor: color.raised,
    color: color.fg,
    fontWeight: 500,
  },
  navIcon: {
    flexShrink: 0,
    height: "1.25rem",
    width: "1.25rem",
  },
  spacer: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  account: {
    alignItems: "center",
    borderRadius: radius.nav,
    color: color.fg,
    display: "flex",
    gap: "0.75rem",
    paddingBlock: "0.625rem",
    paddingInline: "0.875rem",
    textDecoration: "none",
  },
  accountCurrent: {
    backgroundColor: color.raised,
  },
  initials: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    color: color.fg2,
    display: "flex",
    fontSize: text.s12,
    fontWeight: 500,
    height: "2rem",
    justifyContent: "center",
    width: "2rem",
  },
  accountName: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontSize: text.s15,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountIcon: {
    color: color.fg3,
    height: "1.125rem",
    width: "1.125rem",
  },
  accountIconCurrent: {
    color: color.fg,
  },
  header: {
    alignItems: "center",
    display: { default: "flex", [stylex.env.desktop]: "none" },
    justifyContent: "space-between",
    paddingInline: "1.25rem",
    paddingTop: SAFE_TOP,
  },
  headerName: {
    fontSize: text.s22,
    fontWeight: 500,
    letterSpacing: tracking.tight,
  },
  headerSettings: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    color: color.fg2,
    display: "flex",
    height: "2.25rem",
    justifyContent: "center",
    width: "2.25rem",
  },
  headerSettingsCurrent: {
    backgroundColor: color.inverse,
    color: color.onInverse,
  },
  headerIcon: {
    height: "1.0625rem",
    width: "1.0625rem",
  },
  main: {
    alignItems: "center",
    backgroundColor: { default: null, [stylex.env.desktop]: color.panel },
    borderRadius: { default: null, [stylex.env.desktop]: radius.r24 },
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflowY: { default: null, [stylex.env.desktop]: "auto" },
    // On a phone the page ends above the tab bar.
    paddingBottom: { default: "9rem", [stylex.env.desktop]: "4.5rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "4.5rem" },
    paddingTop: { default: "1.25rem", [stylex.env.desktop]: "4.5rem" },
  },
  mainFill: {
    overflowX: { default: null, [stylex.env.desktop]: "hidden" },
    overflowY: { default: null, [stylex.env.desktop]: "hidden" },
    paddingBottom: { default: "9rem", [stylex.env.desktop]: "3.5rem" },
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "1.25rem", [stylex.env.desktop]: "2.75rem" },
    width: "100%",
  },
  columnFill: {
    flexBasis: { default: null, [stylex.env.desktop]: "0%" },
    flexGrow: { default: null, [stylex.env.desktop]: 1 },
    flexShrink: { default: null, [stylex.env.desktop]: 1 },
    minHeight: { default: null, [stylex.env.desktop]: 0 },
  },
  // The page fades out behind the tab bar.
  fade: {
    backgroundImage: `linear-gradient(to top in oklab, ${color.panel} 45%, transparent)`,
    bottom: 0,
    display: { default: null, [stylex.env.desktop]: "none" },
    height: "9.375rem",
    insetInline: 0,
    pointerEvents: "none",
    position: "fixed",
  },
  tabs: {
    bottom: SAFE_BOTTOM,
    display: { default: "flex", [stylex.env.desktop]: "none" },
    insetInline: 0,
    justifyContent: "center",
    position: "fixed",
  },
  tabBar: {
    backgroundColor: color.base,
    borderColor: color.line,
    borderRadius: radius.pill,
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    gap: "0.125rem",
    padding: "0.375rem",
  },
  tab: {
    alignItems: "center",
    borderRadius: radius.pill,
    color: color.fg2,
    display: "flex",
    flexDirection: "column",
    fontSize: text.s11,
    fontWeight: 500,
    gap: "3px",
    height: "3.25rem",
    justifyContent: "center",
    textDecoration: "none",
    width: "4rem",
  },
  tabCurrent: {
    backgroundColor: color.raised,
    color: color.fg,
  },
  tabIcon: {
    height: "1.25rem",
    width: "1.25rem",
  },
});

const widths = stylex.create({
  page: { maxWidth: { default: null, [stylex.env.desktop]: "80rem" } },
  wide: { maxWidth: { default: null, [stylex.env.desktop]: "100rem" } },
  narrow: { maxWidth: { default: null, [stylex.env.desktop]: "60rem" } },
  full: { maxWidth: { default: null, [stylex.env.desktop]: "none" } },
});

const WORD_BREAK = /[^a-zA-Z]+/u;

/** A short name and initials from the part of the email address before the @. */
const nameOf = (account: string | null) => {
  const [local = ""] = (account ?? "").split("@");
  const [first, second] = local.split(WORD_BREAK).filter((part) => part !== "");

  if (first === undefined) {
    return { initials: "", name: "Account" };
  }

  return {
    initials: (first.charAt(0) + (second?.charAt(0) ?? "")).toUpperCase(),
    name: first.charAt(0).toUpperCase() + first.slice(1),
  };
};

/** A destination also covers the pages under it, unless it is `exact`. */
const isCurrent = (to: string, path: string, exact = false): boolean =>
  path === to || (!exact && path.startsWith(`${to}/`));

/** A destination is current on its own path and on the other paths that belong to it. */
const isDestination = (
  { to, exact, also = [] }: ShellDestination,
  path: string
): boolean =>
  isCurrent(to, path, exact) || also.some((one) => isCurrent(one, path));

const current = (active: boolean): { "aria-current"?: "page" } =>
  active ? { "aria-current": "page" } : {};

interface ShellProps {
  children: ReactNode;
  /** The name of the app while this course is open, such as "norsk". */
  name: string;
  /** Every course the learner can open, in the order the sidebar lists them. */
  courses: readonly ShellCourse[];
  /** The id of the course that is open. */
  course: string;
  /** The pages in the sidebar and the tab bar, in order. */
  destinations: readonly ShellDestination[];
  /** Where the account row and the cog lead. */
  settingsTo: string;
  /** The path of the page that is showing, such as "/map". */
  currentPath: string;
  /** The email address of the signed-in learner, or null. */
  account: string | null;
  /** Renders every link of the shell. See `ShellLinkProps`. */
  link: ComponentType<ShellLinkProps>;
  /** Width of the content column on a wide screen: 80rem, 100rem, 60rem, or all of it. */
  width?: ShellWidth;
  /** The page fills the window and scrolls inside its own parts, instead of scrolling as a whole. */
  fill?: boolean;
}

export const Shell = ({
  children,
  name: appName,
  courses,
  course,
  destinations,
  settingsTo,
  currentPath,
  account,
  link: Link,
  width = "page",
  fill = false,
}: ShellProps) => {
  const onSettings = isCurrent(settingsTo, currentPath);
  const { name, initials } = nameOf(account);

  return (
    <div {...stylex.props(styles.frame)}>
      <nav aria-label="Main" {...stylex.props(styles.sidebar)}>
        <div {...stylex.props(styles.sidebarName)}>{appName}</div>
        {destinations.map((destination) => {
          const { to, label, icon: Icon } = destination;
          const active = isDestination(destination, currentPath);

          return (
            <Link
              key={to}
              to={to}
              {...current(active)}
              {...stylex.props(
                effects.press,
                styles.sidebarLink,
                active && styles.sidebarLinkCurrent
              )}
            >
              <Icon {...stylex.props(styles.navIcon)} />
              {label}
            </Link>
          );
        })}
        <div {...stylex.props(styles.spacer)} />
        <div {...stylex.props(styles.courses)}>
          <div {...stylex.props(styles.coursesLabel)}>Languages</div>
          {courses.map((one) => {
            const open = one.id === course;

            return (
              <Link
                key={one.id}
                to={one.to}
                {...current(open)}
                {...stylex.props(
                  effects.press,
                  styles.course,
                  open && styles.courseCurrent
                )}
              >
                <span
                  aria-hidden
                  {...stylex.props(
                    styles.courseFlag,
                    !open && styles.courseFlagOther
                  )}
                >
                  {one.flag}
                </span>
                <span {...stylex.props(styles.courseLabel)}>{one.label}</span>
                {open ? (
                  <Check aria-hidden {...stylex.props(styles.courseCheck)} />
                ) : null}
              </Link>
            );
          })}
        </div>
        <Link
          to={settingsTo}
          aria-label="Settings"
          {...current(onSettings)}
          {...stylex.props(
            effects.press,
            styles.account,
            onSettings && styles.accountCurrent
          )}
        >
          <span {...stylex.props(styles.initials)}>{initials}</span>
          <span {...stylex.props(styles.accountName)}>{name}</span>
          <Settings
            {...stylex.props(
              styles.accountIcon,
              onSettings && styles.accountIconCurrent
            )}
          />
        </Link>
      </nav>

      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.headerName)}>{appName}</span>
        <Link
          to={settingsTo}
          aria-label="Settings"
          {...current(onSettings)}
          {...stylex.props(
            effects.press,
            styles.headerSettings,
            onSettings && styles.headerSettingsCurrent
          )}
        >
          <Settings {...stylex.props(styles.headerIcon)} />
        </Link>
      </header>

      <main {...stylex.props(styles.main, fill && styles.mainFill)}>
        <div
          {...stylex.props(
            styles.column,
            fill && styles.columnFill,
            widths[width]
          )}
        >
          {children}
        </div>
      </main>

      <div {...stylex.props(styles.fade)} />
      <nav aria-label="Main" {...stylex.props(styles.tabs)}>
        <div {...stylex.props(styles.tabBar)}>
          {destinations.map((destination) => {
            const { to, label, icon: Icon } = destination;
            const active = isDestination(destination, currentPath);

            return (
              <Link
                key={to}
                to={to}
                {...current(active)}
                {...stylex.props(
                  effects.press,
                  styles.tab,
                  active && styles.tabCurrent
                )}
              >
                <Icon {...stylex.props(styles.tabIcon)} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
