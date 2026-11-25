import { Bare } from "@norsk/ui";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { SignInScreen } from "../components/sign-in-screen";
import { startJournal } from "../journal";
import { learner, useReady, useSettings, useSyncStatus } from "../learner";

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

/** Loads the learner's data from this device before any page renders, and shows the sign-in screen until the learner is signed in. */
const App = () => {
  const ready = useReady();
  const { textScale } = useSettings();
  const sync = useSyncStatus();

  useEffect(() => {
    learner.start().catch(reportError);

    if ("serviceWorker" in navigator && import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch(reportError);
    }

    return startJournal();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--text-scale",
      String(textScale)
    );
  }, [textScale]);

  // `bun run dev` serves the app without the sign-in server, so it skips the sign-in screen.
  const open = sync.linked || import.meta.env.DEV;

  if (!ready || (!open && !sync.checked)) {
    return <Bare />;
  }

  if (!open) {
    return <SignInScreen />;
  }

  return <Outlet />;
};

export const Route = createRootRoute({
  component: App,
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
      { title: "Norsk" },
      {
        content: "Learn Norwegian with spaced, compressed recall.",
        name: "description",
      },
      { content: "#212121", name: "theme-color" },
      { content: "dark", name: "color-scheme" },
      { content: "yes", name: "apple-mobile-web-app-capable" },
      // The app draws under the status bar, as in the design.
      {
        content: "black-translucent",
        name: "apple-mobile-web-app-status-bar-style",
      },
      { content: "Norsk", name: "apple-mobile-web-app-title" },
    ],
  }),
  shellComponent: RootDocument,
});
