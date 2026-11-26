import { BookOpen, Sun, Waypoints } from "lucide-react";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Shell } from "../src/index";
import type {
  ShellCourse,
  ShellDestination,
  ShellLinkProps,
} from "../src/index";

const DESTINATIONS: readonly ShellDestination[] = [
  { exact: true, icon: Sun, label: "Today", to: "/" },
  { icon: Waypoints, label: "Map", to: "/map" },
  { icon: BookOpen, label: "Stories", to: "/stories" },
];

// Stands in for the router's link. The marker shows that the shell rendered through it.
const TestLink = ({ to, children, ...rest }: ShellLinkProps) => (
  <a href={`/app${to}`} data-test-link="" {...rest}>
    {children}
  </a>
);

const NORWEGIAN: ShellCourse = {
  flag: "🇳🇴",
  id: "no",
  label: "Norwegian",
  to: "/",
};

const GERMAN: ShellCourse = {
  flag: "🇩🇪",
  id: "de",
  label: "German",
  to: "/de",
};

interface PageProps {
  path: string;
  courses?: readonly ShellCourse[];
}

const ONE_COURSE = [NORWEGIAN];

const Page = ({ path, courses = ONE_COURSE }: PageProps) => (
  <Shell
    name="norsk"
    courses={courses}
    course="no"
    destinations={DESTINATIONS}
    settingsTo="/settings"
    currentPath={path}
    account="marco.rossi@example.com"
    link={TestLink}
  >
    <h1>Page</h1>
  </Shell>
);

test("on a wide screen the sidebar links go through the supplied link component", async () => {
  await page.viewport(1440, 900);

  const screen = await render(<Page path="/map" />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  // Only the sidebar is in the accessibility tree; the tab bar is hidden at this width.
  await expect.element(nav).toBeVisible();

  await Promise.all(
    DESTINATIONS.map(async ({ label, to }) => {
      const link = nav.getByRole("link", { name: label });

      await expect.element(link).toHaveAttribute("href", `/app${to}`);
      await expect.element(link).toHaveAttribute("data-test-link");
    })
  );

  await expect
    .element(nav.getByRole("link", { name: "Map" }))
    .toHaveAttribute("aria-current", "page");
  await expect
    .element(nav.getByRole("link", { name: "Today" }))
    .not.toHaveAttribute("aria-current");
});

test("the account row shows a name and initials from the address and leads to settings", async () => {
  await page.viewport(1440, 900);

  const screen = await render(<Page path="/" />);

  const settings = screen
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", {
      name: "Settings",
    });

  await expect.element(settings).toHaveAttribute("href", "/app/settings");
  await expect.element(settings.getByText("MR", { exact: true })).toBeVisible();
  await expect
    .element(settings.getByText("Marco", { exact: true }))
    .toBeVisible();
  await expect.element(settings).not.toHaveAttribute("aria-current");
});

test("a page under a destination keeps that destination current", async () => {
  await page.viewport(1440, 900);

  const screen = await render(<Page path="/stories/first" />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  await expect
    .element(nav.getByRole("link", { name: "Stories" }))
    .toHaveAttribute("aria-current", "page");
  // The home page is only current on its own path.
  await expect
    .element(nav.getByRole("link", { name: "Today" }))
    .not.toHaveAttribute("aria-current");
});

test("on a phone the tab bar replaces the sidebar", async () => {
  await page.viewport(393, 852);

  const screen = await render(<Page path="/settings" />);
  const nav = screen.getByRole("navigation", { name: "Main" });

  await expect.element(nav).toBeVisible();
  await expect
    .element(nav.getByRole("link", { name: "Map" }))
    .toHaveAttribute("href", "/app/map");
  // The cog moves to the header, outside the navigation.
  await expect
    .element(nav.getByRole("link", { name: "Settings" }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("link", { name: "Settings" }))
    .toHaveAttribute("aria-current", "page");
});

test("the sidebar shows the name of the app and lists every course, each a link to its first page", async () => {
  await page.viewport(1440, 900);

  const screen = await render(
    <Page path="/map" courses={[NORWEGIAN, GERMAN]} />
  );

  const nav = screen.getByRole("navigation", { name: "Main" });

  await expect.element(nav.getByText("norsk", { exact: true })).toBeVisible();
  await expect.element(nav.getByText("Languages")).toBeVisible();

  const open = nav.getByRole("link", { name: "Norwegian" });
  const other = nav.getByRole("link", { name: "German" });

  await expect.element(open).toHaveAttribute("aria-current", "page");
  await expect.element(other).toHaveAttribute("href", "/app/de");
  await expect.element(other).toHaveAttribute("data-test-link");
  await expect.element(other).not.toHaveAttribute("aria-current");
});

test("on a phone the list of courses is not shown: the sidebar is gone", async () => {
  await page.viewport(393, 852);

  const screen = await render(
    <Page path="/map" courses={[NORWEGIAN, GERMAN]} />
  );

  await expect
    .element(screen.getByRole("link", { name: "German" }))
    .not.toBeInTheDocument();
});
