import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";
import { report, startReporting } from "./sentry";

export const getRouter = () => {
  const router = createTanStackRouter({
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // The router catches an error of a page to show its error screen, so nothing else would see it.
    defaultOnCatch: (error) => {
      report(error instanceof Error ? error : new Error(String(error)));
    },
    routeTree,
    scrollRestoration: true,
  });

  // The page is also rendered once when the app is built, where there is nothing to report.
  if (!import.meta.env.SSR) {
    startReporting(router);
  }

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
