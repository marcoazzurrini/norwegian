// Every screen and state of the app, as a list of short walks through it. Each walk starts from
// its own learner data and takes a picture at every state worth comparing.
import { setTimeout as sleep } from "node:timers/promises";

import type { Page } from "@playwright/test";

import type { Profile } from "./seed";
import type { Stage } from "./stage";

export interface Scenario {
  name: string;
  profile: Profile;
  textScale?: number;
  random?: number;
  voices?: number;
  aiText?: string;
  walk: (stage: Stage) => Promise<void>;
}

/** How long a right pick stays marked before a quiz moves on. */
const RIGHT_PAUSE_MS = 450;

/** A task counts for at most this long, so this much time always ends a short session. */
const LONG_MS = 180_000;

/** Five sound questions left open this long use up most of a session of fifteen minutes, but not all of it. */
const SLOW_MS = 150_000;

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

const button = (page: Page, name: string) =>
  page.getByRole("button", { exact: true, name });

const press = async (page: Page, name: string) => {
  await button(page, name).click();
};

/** Presses the main action. On a wide screen its name ends with the key hint. */
const proceed = async (page: Page) => {
  await page.getByRole("button", { name: /^Continue/u }).click();
};

/** Waits until one of the texts is on the page, and returns it. */
const whichOf = async <Text extends string>(
  page: Page,
  texts: readonly Text[],
  tries = 0
): Promise<Text> => {
  const shown = await Promise.all(
    texts.map(
      async (text) => await page.getByText(text, { exact: true }).isVisible()
    )
  );

  const found = texts.find((_, at) => shown[at] === true);

  if (found !== undefined) {
    return found;
  }

  if (tries > 150) {
    throw new Error(`None of these appeared: ${texts.join(" / ")}`);
  }

  await sleep(100);

  return await whichOf(page, texts, tries + 1);
};

/** The place in a run of sound questions, such as "2 of 6". */
const place = async (page: Page) => {
  const text = await page
    .getByText(/^\d+ of \d+$/u)
    .first()
    .textContent();

  return text ?? "";
};

/** Goes on to the next sound question and waits until it is there. */
const nextSound = async (page: Page) => {
  const before = await place(page);

  await proceed(page);
  await page.getByText(before, { exact: true }).waitFor({ state: "detached" });
};

/** The nouns a session asks first, by the meaning shown. */
const NOUNS = {
  child: { bare: "barn", full: "et barn" },
  man: { bare: "mann", full: "en mann" },
  woman: { bare: "kvinne", full: "ei kvinne" },
} as const;

const MEANINGS = ["child", "man", "woman"] as const;

/** The sentences a session asks first: the answer, one with a word missing, one in the wrong order. */
const SENTENCES = {
  "He lives in Oslo, but he is from Bergen.": {
    missing: "Han bor i Oslo, men han fra Bergen",
    right: "Han bor i Oslo, men han er fra Bergen",
    shuffled: "Han bor i Oslo, men er han fra Bergen",
  },
  "I do not speak Norwegian.": {
    missing: "Jeg snakker norsk",
    right: "Jeg snakker ikke norsk",
    shuffled: "Jeg ikke snakker norsk",
  },
  "I speak a little Norwegian.": {
    missing: "Jeg snakker norsk",
    right: "Jeg snakker litt norsk",
    shuffled: "Jeg litt snakker norsk",
  },
  "I understand a little.": {
    missing: "Jeg forstår",
    right: "Jeg forstår litt",
    shuffled: "Jeg litt forstår",
  },
  "I understand, but I do not speak Norwegian.": {
    missing: "Jeg forstår, men jeg snakker norsk",
    right: "Jeg forstår, men jeg snakker ikke norsk",
    shuffled: "Jeg forstår, men jeg ikke snakker norsk",
  },
  "Yes please.": {
    missing: "Ja",
    right: "Ja takk",
    shuffled: "Takk ja",
  },
  "They do not speak Norwegian.": {
    missing: "De snakker norsk",
    right: "De snakker ikke norsk",
    shuffled: "De ikke snakker norsk",
  },
} as const;

const ENGLISH = [
  "He lives in Oslo, but he is from Bergen.",
  "I do not speak Norwegian.",
  "I speak a little Norwegian.",
  "I understand a little.",
  "I understand, but I do not speak Norwegian.",
  "They do not speak Norwegian.",
  "Yes please.",
] as const;

const sentenceAsked = async (page: Page) =>
  SENTENCES[await whichOf(page, ENGLISH)];

/** Types an answer into the composer and sends it. */
const answer = async (page: Page, text: string) => {
  const field = page.getByRole("textbox");

  await field.fill(text);
  await field.press("Enter");
};

/** Picks an option of a quiz. On a wide screen its number comes before the text. */
const pick = async (page: Page, option: string) => {
  await page
    .getByRole("button")
    .filter({ hasText: new RegExp(`^\\d?${escapeRegExp(option)}$`, "u") })
    .click();
};

const seen = async (page: Page, text: string) => {
  await page.getByText(text, { exact: false }).first().waitFor();
};

const gone = async (page: Page, text: string) => {
  await page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "detached" });
};

/** A page inside the shell, as it opens. */
const still = (
  name: string,
  profile: Profile,
  route: string,
  extra: Partial<Scenario> = {}
): Scenario => ({
  name,
  profile,
  walk: async ({ open, shot }) => {
    await open(route);
    await shot("page");
  },
  ...extra,
});

export const scenarios: Scenario[] = [
  still("today-empty", "empty", "/"),
  still("today-progress", "progress", "/"),
  still("today-first-lesson", "afterGreetings", "/"),
  still("today-scale-125", "progress", "/", { textScale: 1.25 }),
  still("map-empty", "empty", "/map"),
  {
    name: "map",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      await open("/map");
      await shot("next");
      await press(page, "Greetings");
      await shot("learned");
      await press(page, "Things");
      await shot("ready");
      await press(page, "Learn this next");
      await seen(page, "This lesson is next.");
      await shot("chosen");
      await press(page, "Can, will, must");
      await shot("locked");
    },
  },
  still("items-empty", "empty", "/items"),
  {
    name: "items",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      const search = page.getByRole("textbox", { name: "Search items" });

      await open("/items");
      await shot("list");
      await search.fill("takk");
      await shot("search");
      await search.fill("zzzz");
      await seen(page, "No item matches");
      await shot("search-none");
      await search.fill("");
      await page.getByRole("button", { name: /^en mann/u }).click();
      await shot("noun");
      await page.getByRole("button", { name: /^å snakke/u }).click();
      await shot("verb");
      await page.getByRole("button", { name: /^Saying "the"/u }).click();
      await shot("pattern");
      await page.getByRole("button", { name: /^en telefon/u }).click();
      await shot("not-learned");
    },
  },
  still("stories-empty", "empty", "/stories"),
  still("stories", "progress", "/stories"),
  {
    name: "story",
    profile: "progress",
    walk: async ({ open, page, shot, tick }) => {
      await open("/stories/st1-1");
      await shot("text");
      await press(page, "Show English");
      await shot("english");
      await button(page, "norsk").click();
      await shot("word");
      await press(page, "Hide English");
      await press(page, "Play the whole story");
      await button(page, "Stop").waitFor();
      await shot("playing");
      await press(page, "Stop");
      await press(page, "Questions");
      await shot("question");
      await pick(page, "Norway");
      await shot("wrong");
      await pick(page, "Italy");
      await shot("right", { hold: true });
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "Which languages does Maria speak?");
      await shot("question-2");
      await pick(page, "Norwegian and English");
      await tick(RIGHT_PAUSE_MS);
      await page.getByRole("heading", { level: 1, name: "Stories" }).waitFor();
      await shot("read");
    },
  },
  {
    name: "story-new-words",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      await open("/stories/st10-18");
      await shot("text");
      // A word that is not an item of the course, a word that is not taught yet, and a phrase.
      await button(page, "ski").nth(1).click();
      await shot("new-word");
      await button(page, "helga").click();
      await shot("not-taught");
      await button(page, "høres").click();
      await shot("phrase");
    },
  },
  still("sounds-empty", "empty", "/sounds"),
  still("sounds-one-voice", "progress", "/sounds", { voices: 1 }),
  still("sounds-voices", "progress", "/sounds", { voices: 3 }),
  {
    name: "sounds",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      await open("/sounds");
      await shot("list");
      await press(page, "Practise all sounds");
      await seen(page, "Which word do you hear?");
      await shot("question");
      // The word played is always the second one, because the random numbers are constant.
      await page.keyboard.press("2");
      await seen(page, "Tap each word to hear the difference.");
      await shot("right");
      await nextSound(page);
      await page.keyboard.press("1");
      await seen(page, "Tap each word to hear the difference.");
      await shot("wrong");
      await press(page, "Close");
      await shot("after");
    },
  },
  still("settings-empty", "empty", "/settings"),
  still("settings-voices", "progress", "/settings", { voices: 3 }),
  {
    name: "settings",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      await open("/settings");
      await shot("page");
      await press(page, "Start over");
      await shot("confirm");
      await press(page, "Cancel");
      await shot("cancelled");
      await press(page, "Start over");
      await press(page, "Delete everything");
      await seen(page, "All progress deleted.");
      await shot("deleted");
    },
  },
  {
    name: "intro",
    profile: "empty",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");
      await seen(page, "1 of 3");
      await shot("show-word");
      await proceed(page);
      await seen(page, "2 of 3");
      await shot("show-phrase");
      await proceed(page);
      await seen(page, "3 of 3");
      await shot("show-last");
      await proceed(page);
      await seen(page, "Step 2 of 2");
      await shot("recall");
      await answer(page, "nei");
      await seen(page, "Not yet.");
      await shot("wrong-once");
      await answer(page, "nei");
      await seen(page, "Copy it once");
      await shot("copy");
      await answer(page, "hei");
      await seen(page, "Correct. It comes back in a few minutes.");
      await shot("correct");
      await proceed(page);
      await seen(page, "2 of 3");
      await answer(page, "ha det bra");
      await seen(page, "Correct. It comes back in a few minutes.");
      await shot("correct-phrase");
    },
  },
  {
    name: "intro-noun",
    profile: "beforeHome",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");
      await seen(page, "1 of 3");
      await shot("show");
      await proceed(page);
      await proceed(page);
      await proceed(page);
      await seen(page, "Step 2 of 2");
      await answer(page, "rom");
      await seen(page, "Not yet.");
      await shot("article");
      await answer(page, "et rom");
      await seen(page, "Correct. It comes back in a few minutes.");
      await shot("correct");
    },
  },
  {
    name: "cards",
    profile: "progress",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");

      const first = NOUNS[await whichOf(page, MEANINGS)];

      await shot("asked");
      await answer(page, "gutt");
      await seen(page, "Not yet.");
      await shot("retry");
      await press(page, "Show answer");
      await seen(page, "This is the answer.");
      await shot("revealed");
      await proceed(page);
      await gone(page, first.full);

      const second = NOUNS[await whichOf(page, MEANINGS)];

      await answer(page, second.bare);
      await seen(page, "Not yet.");
      await shot("retry-article");
      await answer(page, second.full);
      await seen(page, "Correct on the second try.");
      await shot("second-try");
      await proceed(page);
      await gone(page, "Correct on the second try.");

      const third = NOUNS[await whichOf(page, MEANINGS)];

      await answer(page, third.full);
      await seen(page, "Correct.");
      await shot("correct");
    },
  },
  {
    name: "cards-scale-125",
    profile: "progress",
    textScale: 1.25,
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");

      const first = NOUNS[await whichOf(page, MEANINGS)];

      await answer(page, "gutt");
      await seen(page, "Not yet.");
      await shot("retry");
      await answer(page, first.full);
      await seen(page, "Correct on the second try.");
      await shot("second-try");
    },
  },
  {
    name: "sentences",
    profile: "reviews",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");

      const first = await sentenceAsked(page);

      await shot("asked");
      await answer(page, first.missing);
      await button(page, "Show answer").waitFor();
      await shot("retry");
      await answer(page, first.shuffled);
      await seen(page, "This is the answer.");
      await shot("wrong");
      await proceed(page);
      await gone(page, "This is the answer.");

      const second = await sentenceAsked(page);

      await answer(page, second.right);
      await seen(page, "Correct.");
      await shot("right");
      await proceed(page);
      await gone(page, "Correct.");

      const third = await sentenceAsked(page);

      await shot("asked-next");
      await answer(page, third.missing);
      await press(page, "Show answer");
      await seen(page, "This is the answer.");
      await shot("revealed");
    },
  },
  {
    name: "sentences-second-try",
    profile: "reviews",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");

      const first = await sentenceAsked(page);

      await answer(page, first.shuffled);
      await button(page, "Show answer").waitFor();
      await shot("retry-order");
      await answer(page, first.right);
      await seen(page, "This sentence reviews");
      await shot("second-try");
    },
  },
  {
    name: "sentences-ai",
    profile: "reviews",
    aiText:
      "In Norwegian «ikke» comes right after the verb, so the verb stays in second place.",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");

      const first = await sentenceAsked(page);

      await answer(page, first.missing);
      await seen(page, "written by AI");
      await shot("hint");
      await answer(page, first.shuffled);
      await seen(page, "This is the answer.");
      await seen(page, "written by AI");
      await shot("explanation");
    },
  },
  {
    name: "pattern",
    profile: "beforeThe",
    walk: async ({ open, page, shot, tick }) => {
      await open("/session?minutes=5");
      await seen(page, "Step 1 of 3");
      await shot("see");
      await proceed(page);
      await seen(page, "Step 2 of 3");
      await shot("quiz");
      await pick(page, "a house");
      await shot("quiz-wrong");
      await pick(page, "the house");
      await shot("quiz-right", { hold: true });
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "2 of 3");
      await pick(page, "a chair");
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "3 of 3");
      await pick(page, "the door");
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "Step 3 of 3");
      await shot("practice");
      await answer(page, "Hvor er bok?");
      await button(page, "Show answer").waitFor();
      await shot("practice-retry");
      await answer(page, "Hvor er boka?");
      await seen(page, "Correct on the second try.");
      await shot("practice-result");
      await proceed(page);
      await seen(page, "2 of 3");
      await shot("practice-next");
    },
  },
  {
    name: "pattern-two-steps",
    profile: "afterGreetings",
    walk: async ({ open, page, shot }) => {
      await open("/session?minutes=5");
      await seen(page, "Step 1 of 2");
      await shot("see");
      await proceed(page);
      await seen(page, "Step 2 of 2");
      await shot("quiz");
    },
  },
  {
    name: "session-long",
    profile: "reviews",
    walk: async ({ open, page, shot, tick }) => {
      await open("/session?minutes=15");
      await seen(page, "Which word do you hear?");
      await shot("sound-asked");
      await page.keyboard.press("2");
      await seen(page, "Tap each word to hear the difference.");
      await shot("sound-right");
      await nextSound(page);
      await page.keyboard.press("1");
      await seen(page, "Tap each word to hear the difference.");
      await shot("sound-wrong");

      // Each of the sounds that are left stays open for a long time, which uses up most of the session.
      const finishSounds = async (): Promise<void> => {
        const before = await place(page);

        await tick(SLOW_MS);
        await proceed(page);
        await page
          .getByText(before, { exact: true })
          .waitFor({ state: "detached" });

        const now = await whichOf(page, [
          "Play again",
          "Show English",
        ] as const);

        if (now === "Show English") {
          return;
        }

        await page.keyboard.press("2");
        await seen(page, "Tap each word to hear the difference.");
        await finishSounds();
      };

      await finishSounds();
      await seen(page, "Listen and read along.");
      await shot("story");
      await press(page, "Questions");
      await seen(page, "Question 1 of 2");
      await shot("story-question");
      await pick(page, "Italy");
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "Question 2 of 2");
      await tick(LONG_MS);
      await pick(page, "Norwegian and English");
      await tick(RIGHT_PAUSE_MS);
      await seen(page, "Ferdig!");
      await shot("done");
    },
  },
  {
    name: "session-short",
    profile: "empty",
    walk: async ({ open, page, shot, tick }) => {
      await open("/session?minutes=1");
      await proceed(page);
      await proceed(page);
      await proceed(page);
      await answer(page, "hei");
      await proceed(page);
      await answer(page, "ha det bra");
      await proceed(page);
      await answer(page, "takk");
      await seen(page, "Correct. It comes back in a few minutes.");
      await tick(LONG_MS);
      await proceed(page);
      await seen(page, "Ferdig!");
      await shot("done");
      await page.getByRole("link", { name: "Back to Today" }).click();
      await page.getByRole("link", { name: "Start session" }).waitFor();
      await shot("today-after");
    },
  },
];
