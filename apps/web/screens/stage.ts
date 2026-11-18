// One browser page set up so that the app draws the same picture on every run: the learner data
// is written before the app starts, the clock only moves when the script moves it, random
// numbers are constant, and nothing is spoken.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Browser, Page } from "@playwright/test";

import { NOW, writeSeed } from "./learner-data";
import type { Seed } from "./learner-data";

export interface Screen {
  name: "desktop" | "phone" | "wide";
  width: number;
  height: number;
  /** A phone has a touch screen, which hides the key hints. */
  touch: boolean;
}

export const SCREENS: readonly Screen[] = [
  { height: 900, name: "desktop", touch: false, width: 1440 },
  { height: 852, name: "phone", touch: true, width: 393 },
];

/** The size the designs are drawn at, where the display type is at its largest. Only on request. */
export const WIDE_SCREEN: Screen = {
  height: 1440,
  name: "wide",
  touch: false,
  width: 2560,
};

/** A second picture is taken in a window this tall, to show what scrolls inside a panel. */
const TALL = 2200;

/** A page taller than this is cut off: the browser cannot take a picture of any height. */
const LONGEST = 6000;

/** Time the clock moves before a picture, so short timers of the app have fired. */
const SETTLE_MS = 500;

export interface StageOptions {
  seed: Seed;
  /** What `Math.random()` returns, every time. */
  random?: number;
  /** How many Norwegian voices the device pretends to have. */
  voices?: number;
  /** What the language model answers. Without it the request fails, as it does in development. */
  aiText?: string;
}

export interface ShotOptions {
  /** Take the picture without moving the clock first, to catch a state that a timer ends. */
  hold?: boolean;
}

export interface Stage {
  page: Page;
  screen: Screen;
  /** Opens a path of the app and waits until the learner data is loaded. */
  open: (route: string) => Promise<void>;
  /** Moves the clock of the page forward, which fires the timers that fall due. */
  tick: (ms: number) => Promise<void>;
  /** Saves a picture of the page as it is now. */
  shot: (name: string, options?: ShotOptions) => Promise<void>;
  close: () => Promise<void>;
}

/** Runs inside the page before any of its code: constant random numbers and a silent voice. */
const pinPage = ({ random, voices }: { random: number; voices: number }) => {
  Math.random = () => random;

  const names = ["Nora", "Henrik", "Ingrid"];

  const list = names.slice(0, voices).map((name, index) => ({
    default: index === 0,
    lang: "nb-NO",
    localService: true,
    name,
    voiceURI: `screens-${name}`,
  }));

  // Speech never starts and never ends, so a line that is being read stays marked until the
  // script stops it.
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: {
      addEventListener: () => {
        // The voices never change.
      },
      cancel: () => {
        // Nothing is being spoken.
      },
      getVoices: () => list,
      removeEventListener: () => {
        // No listener was kept.
      },
      speak: () => {
        // Nothing is spoken.
      },
    },
  });

  Object.defineProperty(window, "SpeechSynthesisUtterance", {
    configurable: true,
    // A real utterance takes listeners for its end. This one never ends.
    value: class extends EventTarget {
      text: string;
      lang = "";
      rate = 1;
      voice = null;
      onend = null;
      onerror = null;

      constructor(text: string) {
        super();
        this.text = text;
      }
    },
  });
};

/** Runs inside the page: everything that tells whether the page is still changing. */
const fingerprint = () => {
  const scrolled = [...document.querySelectorAll("*")].flatMap((element) =>
    element.scrollTop === 0 && element.scrollLeft === 0
      ? []
      : [`${element.scrollTop},${element.scrollLeft}`]
  );

  const fontsReady =
    document.fonts.status === "loaded" &&
    document.fonts.check('500 16px "Geist Variable"');

  return [
    fontsReady,
    document.body.innerHTML.length,
    document.styleSheets.length,
    // In development the compiled StyleX rules arrive in this element, a moment after the page.
    document.querySelector("#__stylex_virtual__")?.textContent.length ?? 0,
    window.scrollX,
    window.scrollY,
    ...scrolled,
  ].join("|");
};

/** Resolves when the page has looked the same for a short while and its fonts are in. */
const rest = async (
  page: Page,
  seen = "",
  calm = 0,
  tries = 0
): Promise<void> => {
  if (tries > 200) {
    throw new Error("The page never came to rest");
  }

  await sleep(50);

  const now = await page.evaluate(fingerprint);
  const same = now === seen && now.startsWith("true");

  if (same && calm >= 3) {
    return;
  }

  await rest(page, now, same ? calm + 1 : 0, tries + 1);
};

interface Scrolled {
  path: number[];
  top: number;
  left: number;
}

/** Runs inside the page: where every scrolled element stands, by its place in the document. */
const readScroll = (): Scrolled[] =>
  [...document.querySelectorAll("*")].flatMap((element) => {
    if (element.scrollTop === 0 && element.scrollLeft === 0) {
      return [];
    }

    const place: number[] = [];

    for (
      let at: Element | null = element;
      at !== null && at.parentElement !== null;
      at = at.parentElement
    ) {
      place.unshift([...at.parentElement.children].indexOf(at));
    }

    return [{ left: element.scrollLeft, path: place, top: element.scrollTop }];
  });

/** Runs inside the page: puts every element back where `readScroll` found it. */
const writeScroll = (positions: Scrolled[]) => {
  for (const { path: place, top, left } of positions) {
    let at: Element | undefined = document.documentElement;

    for (const index of place) {
      at = at?.children[index];
    }

    at?.scrollTo({ behavior: "instant", left, top });
  }
};

export const createStage = async (
  browser: Browser,
  base: string,
  folder: string,
  screen: Screen,
  { seed, random = 0.5, voices = 0, aiText }: StageOptions
): Promise<Stage> => {
  const context = await browser.newContext({
    baseURL: base,
    colorScheme: "dark",
    deviceScaleFactor: 1,
    hasTouch: screen.touch,
    isMobile: screen.touch,
    locale: "en-GB",
    reducedMotion: "reduce",
    // A build registers a service worker, which would answer requests from its own store.
    serviceWorkers: "block",
    timezoneId: "Europe/Oslo",
    viewport: { height: screen.height, width: screen.width },
  });

  context.setDefaultTimeout(15_000);
  await context.addInitScript(pinPage, { random, voices });

  // Recordings are not played, and the server of the app is not there in development.
  await context.route("**/audio/**", async (route) => {
    await route.fulfill({ status: 404 });
  });

  await context.route("**/api/**", async (route) => {
    await (aiText !== undefined &&
    route.request().url().endsWith("/api/explain")
      ? route.fulfill({ json: { text: aiText } })
      : route.fulfill({ body: "", status: 404 }));
  });

  const page = await context.newPage();

  // The clock stands still at the same moment on every run, and moves only through `tick`.
  await page.clock.install({ time: NOW });
  await page.clock.pauseAt(NOW);

  // A document of the app's origin that runs none of its code, to write the data from.
  await page.goto("/icon.svg");
  await page.evaluate(writeSeed, seed);

  await mkdir(path.join(folder, screen.name), { recursive: true });

  const tick = async (ms: number) => {
    await page.clock.runFor(ms);
  };

  const picture = async (file: string) => {
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight
    );

    await page.screenshot({
      animations: "disabled",
      caret: "hide",
      // A page that is too long for one picture is cut off at the top part.
      clip: {
        height: Math.min(height, LONGEST),
        width: screen.width,
        x: 0,
        y: 0,
      },
      fullPage: true,
      path: path.join(folder, screen.name, file),
    });
  };

  return {
    close: async () => {
      await context.close();
    },
    open: async (route) => {
      await page.goto(route);

      // The learner data is in when the page shows its navigation, or the top bar of a task.
      await page
        .getByRole("navigation", { name: "Main" })
        .or(page.getByRole("button", { name: "Close" }))
        .first()
        .waitFor({ state: "attached" });

      await rest(page);
    },
    page,
    screen,
    shot: async (name, { hold = false } = {}) => {
      if (!hold) {
        await tick(SETTLE_MS);
      }

      await rest(page);
      await picture(`${name}.png`);

      // The same state in a tall window, where the panels show what they otherwise scroll.
      const scroll = await page.evaluate(readScroll);

      await page.setViewportSize({ height: TALL, width: screen.width });
      await rest(page);
      await picture(`${name}.tall.png`);
      await page.setViewportSize({
        height: screen.height,
        width: screen.width,
      });
      await page.evaluate(writeScroll, scroll);
      await rest(page);
    },
    tick,
  };
};
