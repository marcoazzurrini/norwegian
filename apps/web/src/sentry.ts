// Reports the app's errors to Sentry, so that a failure on the learner's device is seen.
//
// Hides: when reporting is on, how its library is loaded, and what is left out. A build made
// without a key reports nothing and never loads the library, which is how development and the
// browser tests run. The library is loaded apart from the app, so the first page does not wait
// for it. Reports wait on the device while it is offline. Nothing the learner types is sent:
// only the error, where it happened and the page.
import type * as Sentry from "@sentry/react";
import type { AnyRouter } from "@tanstack/react-router";

const DSN: string | undefined = import.meta.env.VITE_SENTRY_DSN;

/** The commit the app was built from, set by the deploy. It tells which version an error came from. */
const RELEASE: string | undefined = import.meta.env.VITE_RELEASE;

/** One page load in ten is timed: enough to see slow pages, and far inside the free plan. */
const TRACES = 0.1;

type Library = typeof Sentry;

/** The library, once reporting has started. Undefined when reporting is off. */
let loading: Promise<Library> | undefined;

const start = async (dsn: string, router: AnyRouter): Promise<Library> => {
  const library = await import("@sentry/react");

  const options: Sentry.BrowserOptions = {
    dsn,
    // The app tells a lost connection by the message of the error, so the message stays as it is.
    enhanceFetchErrorMessages: "report-only",
    environment: import.meta.env.MODE,
    integrations: [library.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: TRACES,
    transport: library.makeBrowserOfflineTransport(library.makeFetchTransport),
  };

  if (RELEASE !== undefined) {
    options.release = RELEASE;
  }

  library.init(options);

  return library;
};

/** Starts the reporting. Call once, in the browser, with the app's router. */
export const startReporting = (router: AnyRouter): void => {
  if (DSN !== undefined && DSN !== "") {
    loading = start(DSN, router);
    loading.catch(reportError);
  }
};

const send = async (
  library: Promise<Library>,
  problem: Error
): Promise<void> => {
  const { captureException } = await library;

  captureException(problem);
};

/** Reports an error that the app caught itself, such as one a page showed an error screen for. */
export const report = (problem: Error): void => {
  if (loading !== undefined) {
    // A library that did not load has nothing to report with.
    send(loading, problem).catch(() => null);
  }
};
