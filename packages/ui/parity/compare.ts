// Proves that @norsk/ui looks the same as the Tailwind components it replaces.
//
// The gallery page of the web app (apps/web/src/routes/gallery.tsx) draws each old component
// in a `data-old="<name>"` cell and its replacement in a `data-new="<name>"` cell. This script
// takes a picture of both, on a wide screen and on a phone, and compares them pixel by pixel.
// It then compares the new side once more on a page that never loads the Tailwind
// stylesheet, to show that the new components do not lean on it.
//
// Run it against a running development server:
//   PARITY_URL=http://localhost:3000 bun run parity
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";
import type { Browser, Locator, Page } from "playwright";
import { PNG } from "pngjs";

const BASE = process.env.PARITY_URL ?? "http://localhost:3000";
const OUTPUT = path.join(import.meta.dirname, "output");

/**
 * The largest difference allowed in one colour channel of one pixel, of 255. Two runs of the
 * same page can differ by this much where the browser blends an edge, so it is noise. Anything
 * a person could see, such as a wrong size, colour or position, moves pixels by far more.
 */
const CHANNEL_TOLERANCE = 2;

const SCREENS = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 852, name: "phone", width: 393 },
] as const;

type Screen = (typeof SCREENS)[number];

/** Patterns that fill the window. The gallery draws each alone, at `?page=<name>&side=old|new`. */
const FULL_PAGES = [
  { name: "shell", query: "page=shell" },
  { name: "shell-narrow", query: "page=shell-narrow" },
  { name: "shell-fill", query: "page=shell-fill" },
  { name: "focus", query: "page=focus" },
  { name: "focus-input", query: "page=focus-input" },
  { name: "focus-wide", query: "page=focus-wide" },
  { name: "bare", query: "page=bare" },
  { name: "sign-in", query: "page=sign-in" },
  { name: "sign-in-refused", query: "page=sign-in&error=1" },
] as const;

/**
 * The old shell marks the current page from the router, so it can only show that state on the
 * real page. Its navigation there is compared with the new shell, told the same path.
 */
const CURRENT_PAGES = [
  { name: "shell-current-today", route: "/" },
  { name: "shell-current-map", route: "/map" },
  { name: "shell-current-settings", route: "/settings" },
] as const;

// The two shells hold different pages. On a phone the tab bar floats over the page, so the
// page is hidden while the navigation is compared.
const HIDE_CONTENT = "main { visibility: hidden; }";

const WITH_TAILWIND = "beside Tailwind";
const WITHOUT_TAILWIND = "Tailwind removed";

interface Result {
  name: string;
  screen: string;
  /** Whether the new side still had the Tailwind stylesheet on its page. */
  mode: string;
  /** Width and height of the pictures. */
  size: string;
  /** Pixels that differ at all. */
  touched: number;
  /** The largest difference in one colour channel, of 255. */
  largest: number;
  pass: boolean;
}

interface Shot {
  name: string;
  picture: Buffer;
}

/** Runs the steps one after the other. A browser page can only do one thing at a time. */
const inTurn = async <Item, Out>(
  items: readonly Item[],
  step: (item: Item) => Promise<Out>,
  done: readonly Out[] = []
): Promise<readonly Out[]> => {
  const [first, ...rest] = items;

  if (first === undefined) {
    return done;
  }

  return await inTurn(rest, step, [...done, await step(first)]);
};

const compare = async (
  screen: Screen,
  mode: string,
  before: Shot,
  after: Shot
): Promise<Result> => {
  const old = PNG.sync.read(before.picture);
  const next = PNG.sync.read(after.picture);
  const folder = mode === WITH_TAILWIND ? screen.name : `${screen.name}-alone`;
  const stem = path.join(OUTPUT, folder, before.name);
  const label = { mode, name: before.name, screen: screen.name };

  await writeFile(`${stem}.old.png`, before.picture);
  await writeFile(`${stem}.new.png`, after.picture);

  if (old.width !== next.width || old.height !== next.height) {
    return {
      ...label,
      largest: 255,
      pass: false,
      size: `${old.width}×${old.height} against ${next.width}×${next.height}`,
      touched: old.width * old.height,
    };
  }

  // The picture of the differences: grey where the two agree, red where they do not.
  const marked = new PNG({ height: old.height, width: old.width });
  let touched = 0;
  let largest = 0;

  for (let at = 0; at < old.data.length; at += 4) {
    const delta = Math.max(
      Math.abs((old.data[at] ?? 0) - (next.data[at] ?? 0)),
      Math.abs((old.data[at + 1] ?? 0) - (next.data[at + 1] ?? 0)),
      Math.abs((old.data[at + 2] ?? 0) - (next.data[at + 2] ?? 0))
    );

    const grey = 255 - Math.floor((old.data[at] ?? 0) / 4);

    marked.data[at] = delta > 0 ? 255 : grey;
    marked.data[at + 1] = delta > 0 ? 0 : grey;
    marked.data[at + 2] = delta > 0 ? 0 : grey;
    marked.data[at + 3] = 255;
    touched += delta > 0 ? 1 : 0;
    largest = Math.max(largest, delta);
  }

  if (touched > 0) {
    await writeFile(`${stem}.diff.png`, PNG.sync.write(marked));
  }

  return {
    ...label,
    largest,
    pass: largest <= CHANNEL_TOLERANCE,
    size: `${old.width}×${old.height}`,
    touched,
  };
};

/** Resolves when nothing on the page is moving and no field holds the focus. */
const rest = async (page: Page) => {
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    await Promise.allSettled(
      document
        .getAnimations()
        .map(async (animation) => await animation.finished)
    );
  });
};

/** The page is ready when the fonts are in and the StyleX rules have reached the browser. */
const settle = async (page: Page, probe: string) => {
  await page.locator(probe).first().waitFor({ state: "attached" });

  await page.waitForFunction(async () => {
    await document.fonts.ready;

    // The development server hands the compiled StyleX rules to the page in this element.
    const rules = document.querySelector("#__stylex_virtual__");

    return rules !== null && (rules.textContent ?? "").length > 0;
  });

  await page.waitForLoadState("networkidle");
  await rest(page);
};

/** Fails unless the page really is without Tailwind: none of its theme variables are set. */
const expectNoTailwind = async (page: Page) => {
  const themed = await page.evaluate(
    () =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--color-panel"
      ) !== ""
  );

  if (themed) {
    throw new Error("The Tailwind stylesheet is still on the page.");
  }
};

const shoot = async (name: string, target: Locator | Page): Promise<Shot> => ({
  name,
  picture: await target.screenshot({
    animations: "disabled",
    caret: "hide",
    scale: "css",
  }),
});

/**
 * Pictures are taken with reduced motion. An entrance that scales its element leaves the
 * browser with a layer drawn at another size for a moment, and that blurs edges by a few
 * levels from run to run. The motion itself is compared separately, in `compareMotion`.
 */
const open = async (
  browser: Browser,
  screen: Screen,
  reducedMotion: "reduce" | "no-preference" = "reduce"
) => {
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion,
    viewport: { height: screen.height, width: screen.width },
  });

  return await context.newPage();
};

/**
 * A page that never gets the app's stylesheet, which is where Tailwind lives.
 * What styles it is @norsk/ui alone: base.css and the StyleX rules.
 */
const openWithoutTailwind = async (browser: Browser, screen: Screen) => {
  const page = await open(browser, screen);

  // The app also imports the file as a module, to learn its address. Only the request for
  // the stylesheet itself is answered with nothing.
  await page.route(/\/src\/styles\.css/u, async (route) => {
    await (route.request().resourceType() === "stylesheet"
      ? route.fulfill({ body: "", contentType: "text/css" })
      : route.continue());
  });

  return page;
};

/**
 * The gallery twice: a page with only the old components and a page with only the new ones.
 * A cell is then at the same place on both, and the pictures line up to the pixel.
 */
const openSides = async (
  browser: Browser,
  screen: Screen,
  reducedMotion: "reduce" | "no-preference" = "reduce"
) => {
  const oldPage = await open(browser, screen, reducedMotion);
  const newPage = await open(browser, screen, reducedMotion);

  await oldPage.goto(`${BASE}/gallery?side=old`);
  await settle(oldPage, "[data-old='choices-right'] button");

  // The old multiple choice shuffles its options. The new one is told the order it chose.
  const order = await oldPage
    .locator("[data-old^='choices']")
    .evaluateAll((cells) =>
      Object.fromEntries(
        cells.map((cell) => [
          cell.dataset.old ?? "",
          [...cell.querySelectorAll("button > span")].map(
            (option) => option.textContent
          ),
        ])
      )
    );

  await newPage.goto(
    `${BASE}/gallery?side=new&order=${encodeURIComponent(JSON.stringify(order))}`
  );
  await settle(newPage, "[data-new='choices-right'] button");

  return { newPage, oldPage };
};

/** Every pair on the gallery page, then the states that need an action first. */
const comparePairs = async (browser: Browser, screen: Screen) => {
  const { oldPage, newPage } = await openSides(browser, screen);
  const alonePage = await openWithoutTailwind(browser, screen);

  await alonePage.goto(newPage.url());
  await settle(alonePage, "[data-new='choices-right'] button");
  await expectNoTailwind(alonePage);

  const oldCell = (name: string) => oldPage.locator(`[data-old="${name}"]`);
  const newCell = (name: string) => newPage.locator(`[data-new="${name}"]`);

  const names = await oldPage
    .locator("[data-old]")
    .evaluateAll((cells) => cells.map((cell) => cell.dataset.old ?? ""));

  // Each cell three times: old, new beside Tailwind, and new on the page without it.
  const atRest = await inTurn(names, async (name) => {
    const before = await shoot(name, oldCell(name));
    const beside = await shoot(name, newCell(name));

    const alone = await shoot(name, alonePage.locator(`[data-new="${name}"]`));

    return [
      await compare(screen, WITH_TAILWIND, before, beside),
      await compare(screen, WITHOUT_TAILWIND, before, alone),
    ];
  });

  const pair = async (name: string, label: string) =>
    await compare(
      screen,
      WITH_TAILWIND,
      await shoot(label, oldCell(name)),
      await shoot(label, newCell(name))
    );

  // A focused field lights its frame.
  const focused = await inTurn(
    ["answer-input-empty", "answer-input-filled"],
    async (name) => {
      await oldCell(name).locator("input").focus();
      await newCell(name).locator("input").focus();

      return await pair(name, `${name}-focused`);
    }
  );

  await rest(oldPage);
  await rest(newPage);

  // Another option is chosen in both groups, on both sides.
  await inTurn([2, 4], async (option) => {
    await oldCell("segmented").getByRole("radio").nth(option).click();
    await newCell("segmented").getByRole("radio").nth(option).click();
  });
  await oldPage.mouse.move(0, 0);
  await newPage.mouse.move(0, 0);
  await rest(oldPage);
  await rest(newPage);

  const picked = await pair("segmented", "segmented-picked");

  // The focus ring of a button, reached with the keyboard: focus the second button, step back.
  await oldCell("button-primary").getByRole("button").nth(1).focus();
  await oldPage.keyboard.press("Shift+Tab");
  await newCell("button-primary").getByRole("button").nth(1).focus();
  await newPage.keyboard.press("Shift+Tab");

  const ring = await pair("button-primary", "button-focus-ring");

  await oldPage.context().close();
  await newPage.context().close();
  await alonePage.context().close();

  return [...atRest.flat(), ...focused, picked, ring];
};

/** What moves on a page: every entrance with its keyframes and timing, and every transition. */
const readMotion = async (page: Page) =>
  await page.evaluate(() => {
    const cells = [
      ...document.querySelectorAll<HTMLElement>("[data-old], [data-new]"),
    ];

    return cells.map((cell) => ({
      entrances: cell.getAnimations({ subtree: true }).map((animation) => {
        const { effect } = animation;
        const timing = effect?.getComputedTiming();

        return {
          duration: timing?.duration,
          easing: timing?.easing,
          fill: timing?.fill,
          frames:
            effect instanceof KeyframeEffect
              ? effect
                  .getKeyframes()
                  .map(({ offset, opacity, transform, easing }) => ({
                    easing,
                    offset,
                    opacity,
                    transform,
                  }))
              : [],
        };
      }),
      name: cell.dataset.old ?? cell.dataset.new ?? "",
      // One entry per property, so "160ms" for three properties and "160ms, 160ms, 160ms"
      // read the same. A comma inside brackets belongs to an easing curve.
      transitions: [...cell.querySelectorAll("*")].flatMap((element) => {
        const style = getComputedStyle(element);
        const commas = /,\s*(?![^(]*\))/u;
        const durations = style.transitionDuration.split(commas);
        const easings = style.transitionTimingFunction.split(commas);

        return style.transitionDuration === "0s"
          ? []
          : style.transitionProperty
              .split(commas)
              .map((property, at) =>
                [
                  property,
                  durations[at % durations.length],
                  easings[at % easings.length],
                ].join(" ")
              );
      }),
    }));
  });

/** The size a button shrinks to while it is held down. */
const readPressed = async (page: Page) => {
  const button = page
    .locator("[data-old='button-primary'], [data-new='button-primary']")
    .getByRole("button")
    .first();

  await button.hover();
  await page.mouse.down();

  // The press is a transition: wait for it to start, then read it once it has ended.
  // A button that does not answer a press never starts, and the wait fails.
  const handle = await button.elementHandle();

  await page.waitForFunction(
    (element) => getComputedStyle(element).transform !== "none",
    handle,
    { timeout: 5000 }
  );

  const transform = await button.evaluate(async (element) => {
    await Promise.allSettled(
      element.getAnimations().map(async (animation) => await animation.finished)
    );

    return getComputedStyle(element).transform;
  });

  await page.mouse.up();

  return transform;
};

/**
 * Motion cannot be judged from a still picture, so it is compared as data: the keyframes,
 * duration, easing and fill of every entrance, the transitions of every element, and the
 * pressed state of a button, with and without the reduced-motion setting.
 */
const compareMotion = async (browser: Browser, screen: Screen) => {
  const results = await inTurn(
    ["no-preference", "reduce"] as const,
    async (preference): Promise<Result> => {
      const { oldPage, newPage } = await openSides(browser, screen, preference);

      const before = await readMotion(oldPage);
      const after = await readMotion(newPage);
      const pressed = [await readPressed(oldPage), await readPressed(newPage)];

      await oldPage.context().close();
      await newPage.context().close();

      const entrances = before.flatMap((cell) => cell.entrances).length;
      const transitions = before.flatMap((cell) => cell.transitions).length;

      const different = before.filter(
        (cell, at) => JSON.stringify(cell) !== JSON.stringify(after[at])
      );

      // A check that found nothing to compare, or a press that does nothing, proves nothing.
      const pass =
        different.length === 0 &&
        before.length === after.length &&
        entrances > 0 &&
        transitions > 0 &&
        pressed[0] === pressed[1] &&
        pressed[0] !== "none";

      return {
        largest: pass ? 0 : 255,
        mode: WITH_TAILWIND,
        name: `motion, ${preference}`,
        pass,
        screen: screen.name,
        size: `${entrances} entrances, ${transitions} transitions, pressed ${pressed[0] ?? ""}`,
        touched: different.length,
      };
    }
  );

  return results;
};

const compareFullPages = async (browser: Browser, screen: Screen) => {
  const page = await open(browser, screen);
  const alonePage = await openWithoutTailwind(browser, screen);

  const results = await inTurn(FULL_PAGES, async ({ name, query }) => {
    await page.goto(`${BASE}/gallery?${query}&side=old`);
    await settle(page, "[data-old] *");

    const before = await shoot(name, page);

    await page.goto(`${BASE}/gallery?${query}&side=new`);
    await settle(page, "[data-new] *");
    await alonePage.goto(page.url());
    await settle(alonePage, "[data-new] *");
    await expectNoTailwind(alonePage);

    return [
      await compare(screen, WITH_TAILWIND, before, await shoot(name, page)),
      await compare(
        screen,
        WITHOUT_TAILWIND,
        before,
        await shoot(name, alonePage)
      ),
    ];
  });

  await page.context().close();
  await alonePage.context().close();

  return results.flat();
};

const compareCurrentPages = async (browser: Browser, screen: Screen) => {
  const page = await open(browser, screen);
  // On a phone the tab bar floats over the page, so only the bar itself is compared.

  const nav =
    screen.name === "desktop"
      ? "nav[aria-label='Main'] >> visible=true"
      : "nav[aria-label='Main'] > div >> visible=true";

  const cog = () =>
    page.getByRole("link", { name: "Settings" }).locator("visible=true");

  const results = await inTurn(CURRENT_PAGES, async ({ name, route }) => {
    await page.goto(`${BASE}${route}`);
    await settle(page, "nav[aria-label='Main'] a");
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    await page.addStyleTag({ content: HIDE_CONTENT });

    const oldNav = await shoot(`${name}-nav`, page.locator(nav));
    const oldCog = await shoot(`${name}-settings`, cog());

    await page.goto(`${BASE}/gallery?page=shell&side=new&at=${route}`);
    await settle(page, "[data-new] nav[aria-label='Main'] a");
    await page.addStyleTag({ content: HIDE_CONTENT });

    return [
      await compare(
        screen,
        WITH_TAILWIND,
        oldNav,
        await shoot(`${name}-nav`, page.locator(nav))
      ),
      await compare(
        screen,
        WITH_TAILWIND,
        oldCog,
        await shoot(`${name}-settings`, cog())
      ),
    ];
  });

  await page.context().close();

  return results.flat();
};

const report = (results: readonly Result[]) => {
  const rows = results.map(
    ({ name, screen, mode, size, touched, largest, pass }) =>
      [
        pass ? "same     " : "DIFFERENT",
        screen.padEnd(7),
        mode.padEnd(16),
        name.padEnd(32),
        size.padEnd(9),
        `pixels touched ${String(touched).padEnd(6)}`,
        `largest difference ${largest}`,
      ].join("  ")
  );

  const failed = results.filter(({ pass }) => !pass);
  const exact = results.filter(({ touched }) => touched === 0);

  return [
    ...rows,
    "",
    `A pair is the same when no colour channel of any pixel differs by more than ${CHANNEL_TOLERANCE} of 255.`,
    `${results.length - failed.length} of ${results.length} pairs are the same; ${exact.length} of them are identical in every pixel.`,
  ].join("\n");
};

await rm(OUTPUT, { force: true, recursive: true });

await Promise.all(
  SCREENS.flatMap(({ name }) => [name, `${name}-alone`]).map(async (folder) => {
    await mkdir(path.join(OUTPUT, folder), { recursive: true });
  })
);

const browser = await chromium.launch();

const results = await inTurn(SCREENS, async (screen) => [
  ...(await comparePairs(browser, screen)),
  ...(await compareFullPages(browser, screen)),
  ...(await compareCurrentPages(browser, screen)),
  ...(await compareMotion(browser, screen)),
]);

await browser.close();

const all = results.flat();
const summary = report(all);

await writeFile(path.join(OUTPUT, "report.txt"), `${summary}\n`);

console.log(summary);

process.exitCode = all.every(({ pass }) => pass) ? 0 : 1;
