// Takes a picture of every screen and state of the app, on a wide screen and on a phone.
//
// Run it against a running development server, and name the set of pictures:
//   bunx vite dev --port 4318 --strictPort
//   bun screens/capture.ts baseline            (every scenario)
//   bun screens/capture.ts current map story   (only the scenarios whose name starts so)
//
// The pictures go to screens/output/<set>/<screen>/<scenario>--<state>.png.
// `bun screens/compare.ts baseline current` then compares two sets pixel by pixel.
import { rm } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import type { Browser } from "@playwright/test";

import { scenarios } from "./scenarios";
import type { Scenario } from "./scenarios";
import { seedFor, signedIn } from "./seed";
import { SCREENS, WIDE_SCREEN, createStage } from "./stage";
import type { Screen, StageOptions } from "./stage";

const BASE = process.env.SCREENS_URL ?? "http://localhost:4318";
const OUTPUT = path.join(import.meta.dirname, "output");

// A production build shows the sign-in screen to a device that never signed in. With this set,
// every learner is signed in, so the same walks can be taken through a build:
//   SCREENS_URL=http://localhost:4322 SCREENS_SIGNED_IN=1 bun screens/capture.ts built
const SIGNED_IN = process.env.SCREENS_SIGNED_IN === "1";

// The two usual screens, or with SCREENS_WIDE=1 only a very wide one (2560×1440).
const screens = process.env.SCREENS_WIDE === "1" ? [WIDE_SCREEN] : SCREENS;

/** How many pages work at the same time. Each has its own learner data and its own clock. */
const WORKERS = 4;

interface Job {
  scenario: Scenario;
  screen: Screen;
}

interface Failure {
  job: string;
  reason: string;
}

const runJob = async (
  browser: Browser,
  folder: string,
  { scenario, screen }: Job
): Promise<Failure | null> => {
  const seed = seedFor(scenario.profile, scenario.textScale);

  const options: StageOptions = {
    seed: SIGNED_IN ? { ...seed, sync: seed.sync ?? signedIn } : seed,
  };

  if (scenario.aiText !== undefined) {
    options.aiText = scenario.aiText;
  }

  if (scenario.random !== undefined) {
    options.random = scenario.random;
  }

  if (scenario.voices !== undefined) {
    options.voices = scenario.voices;
  }

  const stage = await createStage(browser, BASE, folder, screen, options);

  try {
    await scenario.walk({
      ...stage,
      shot: async (name, how) => {
        await stage.shot(`${scenario.name}--${name}`, how);
      },
    });

    return null;
  } catch (error) {
    // What the page showed when the walk lost its way.
    const text = await stage.page
      .locator("body")
      .textContent()
      .catch(() => "");

    return {
      job: `${scenario.name} on ${screen.name}`,
      reason: `${error instanceof Error ? error.message : String(error)}\nThe page showed: ${(text ?? "").replaceAll(/\s+/gu, " ").slice(0, 600)}`,
    };
  } finally {
    await stage.close();
  }
};

/** Takes jobs from the shared list until it is empty. */
const work = async (
  browser: Browser,
  folder: string,
  queue: Job[],
  failures: Failure[] = []
): Promise<Failure[]> => {
  const job = queue.shift();

  if (job === undefined) {
    return failures;
  }

  const failure = await runJob(browser, folder, job);

  console.log(
    `${failure === null ? "done  " : "FAILED"} ${job.scenario.name} on ${job.screen.name}`
  );

  return await work(
    browser,
    folder,
    queue,
    failure === null ? failures : [...failures, failure]
  );
};

const [set, ...wanted] = process.argv.slice(2);

if (set === undefined) {
  throw new Error("Name the set of pictures: bun screens/capture.ts <set>");
}

const folder = path.join(OUTPUT, set);

const chosen = scenarios.filter(
  (scenario) =>
    wanted.length === 0 ||
    wanted.some((start) => scenario.name.startsWith(start))
);

const queue = chosen.flatMap((scenario) =>
  screens.map((screen) => ({ scenario, screen }))
);

// A full run starts from an empty folder, so it holds no picture of a state that is gone.
if (wanted.length === 0) {
  await rm(folder, { force: true, recursive: true });
}

const browser = await chromium.launch({
  args: [
    // Without this the browser repaints only the part of the page that changed, and the pixels
    // at the edge of that part can come out a shade different from one run to the next.
    "--disable-partial-raster",
    // A smooth scroll moves a little with every frame the browser draws, and how many frames it
    // draws before a picture is taken differs from run to run. With this every scroll arrives at once.
    "--disable-smooth-scrolling",
  ],
});

const perWorker = await Promise.all(
  Array.from(
    { length: WORKERS },
    async () => await work(browser, folder, queue)
  )
);

const failures = perWorker.flat();

await browser.close();

for (const { job, reason } of failures) {
  console.error(`\n${job}\n${reason}`);
}

console.log(
  `\n${chosen.length} scenarios on ${screens.length} screens, ${failures.length} failed. Pictures: ${folder}`
);

process.exit(failures.length === 0 ? 0 : 1);
