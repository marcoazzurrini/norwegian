import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { addressInCourse, isCourse } from "../course";
import { startJournal } from "../journal";

import baseCss from "@norsk/ui/base.css?url";

// In development the StyleX plugin serves the compiled rules at this address, and the module
// below replaces them after an edit. A build writes the rules into the base stylesheet instead,
// so the page that is prerendered already has every style it needs.
const DEV_STYLES = import.meta.env.DEV
  ? [{ href: "/virtual:stylex.css", rel: "stylesheet" }]
  : [];

if (import.meta.env.DEV && !import.meta.env.SSR) {
  import("virtual:stylex:runtime").catch(reportError);
}

interface RootDocumentProps {
  children: ReactNode;
}

const RootDocument = ({ children }: RootDocumentProps) => (
  <html lang="en">
    <head>
      <HeadContent />
    </head>
    <body>
      {children}
      <Scripts />
    </body>
  </html>
);

/** What every page shares, whatever the course: offline support and the journal. The pages are the course's. */
const App = () => {
  useEffect(() => {
    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(reportError);
    }

    return startJournal();
  }, []);

  return <Outlet />;
};

/**
 * An address the router does not know. One that names no course is from before there were
 * courses: it goes to the same page of the course that was open last, so old links still work.
 */
const Lost = () => {
  const router = useRouter();
  const { pathname } = router.state.location;
  const first = pathname.split("/").find((part) => part !== "") ?? "";
  const old = !isCourse(first);

  useEffect(() => {
    const now = router.state.location;

    // Another redirect may have moved the address already: only one that still names no course is moved.
    if (old && now.pathname === pathname) {
      router
        .navigate({ href: addressInCourse(now), replace: true })
        .catch(reportError);
    }
  }, [old, pathname, router]);

  return old ? null : <p>This page does not exist.</p>;
};

export const Route = createRootRoute({
  component: App,
  notFoundComponent: Lost,
  head: () => ({
    links: [
      { href: baseCss, rel: "stylesheet" },
      ...DEV_STYLES,
      { href: "/manifest.webmanifest", rel: "manifest" },
      { href: "/icon.svg", rel: "icon", type: "image/svg+xml" },
      { href: "/icon-192.png", rel: "apple-touch-icon" },
    ],
    meta: [
      { charSet: "utf-8" },
      {
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
        name: "viewport",
      },
      { content: "#212121", name: "theme-color" },
      { content: "dark", name: "color-scheme" },
      { content: "yes", name: "apple-mobile-web-app-capable" },
      // The app draws under the status bar, as in the design.
      {
        content: "black-translucent",
        name: "apple-mobile-web-app-status-bar-style",
      },
    ],
  }),
  shellComponent: RootDocument,
});
