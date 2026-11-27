// The parts of a session and the pages around it, each started from a learner who has studied before.
import { JournalRequestSchema } from "@norsk/protocol";
import type { JournalEvent } from "@norsk/protocol";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import * as v from "valibot";

import { answer, asked, open, proceed, startAs } from "./learner";

/** The three nouns that the learner of `progress` met last, by the meaning the app shows. */
const NOUNS = {
  child: { bare: "barn", full: "et barn" },
  man: { bare: "mann", full: "en mann" },
  woman: { bare: "kvinne", full: "ei kvinne" },
} as const;

type Meaning = keyof typeof NOUNS;

const MEANINGS: readonly Meaning[] = ["child", "man", "woman"];

/** Sentences a review may ask for, by the English the app shows. */
const SENTENCES = {
  "He lives in Oslo, but he is from Bergen.": {
    full: "Han bor i Oslo, men han er fra Bergen.",
    short: "Han bor i Oslo, men han er fra",
  },
  "I do not speak Norwegian.": {
    full: "Jeg snakker ikke norsk.",
    short: "Jeg snakker ikke",
  },
  "I speak a little Norwegian.": {
    full: "Jeg snakker litt norsk.",
    short: "Jeg snakker litt",
  },
  "I understand a little.": {
    full: "Jeg forstår litt.",
    short: "Jeg forstår",
  },
  "I understand, but I do not speak Norwegian.": {
    full: "Jeg forstår, men jeg snakker ikke norsk.",
    short: "Jeg forstår, men jeg snakker ikke",
  },
  "They do not speak Norwegian.": {
    full: "De snakker ikke norsk.",
    short: "De snakker ikke",
  },
  "Yes please.": { full: "Ja takk.", short: "Ja" },
} as const;

type English = keyof typeof SENTENCES;

const ENGLISH: readonly English[] = [
  "He lives in Oslo, but he is from Bergen.",
  "I do not speak Norwegian.",
  "I speak a little Norwegian.",
  "I understand a little.",
  "I understand, but I do not speak Norwegian.",
  "They do not speak Norwegian.",
  "Yes please.",
];

/** The reading questions of the pattern 'Saying "the"', in the order they are asked. */
const READING = [
  { prompt: "huset", right: "the house", wrong: "a house" },
  { prompt: "en stol", right: "a chair", wrong: "the chair" },
  { prompt: "døra", right: "the door", wrong: "a door" },
] as const;

/** The sentences that practise the pattern, by the English the app shows. */
const PRACTICE = {
  "Is this the house?": "Er dette huset?",
  "The house is in Oslo.": "Huset er i Oslo.",
  "Where is the book?": "Hvor er boka?",
} as const;

type PracticeEnglish = keyof typeof PRACTICE;

const PRACTICE_ENGLISH: readonly PracticeEnglish[] = [
  "Is this the house?",
  "The house is in Oslo.",
  "Where is the book?",
];

/**
 * An option of a multiple-choice question. Where there is a keyboard its number comes first,
 * and once it was picked its mark comes last.
 */
const option = (page: Page, text: string) =>
  page.getByRole("button", {
    name: new RegExp(`^(?:\\d )?${text}(?: right| wrong)?$`, "u"),
  });

/** The two words of a sound question: every button that is not one of the controls. */
const soundWords = (page: Page) =>
  page.getByRole("button", {
    name: /^(?!Close$|Play the word$|Play again$|Continue)/u,
  });

/** Runs a step for each value, one after another: steps in a browser cannot overlap. */
const inOrder = async <Value>(
  values: readonly Value[],
  step: (value: Value, at: number) => Promise<void>
) => {
  for (const [at, value] of values.entries()) {
    // oxlint-disable-next-line no-await-in-loop -- the steps must not run at the same time
    await step(value, at);
  }
};

test("a review session asks single words, then whole sentences", async ({
  page,
}) => {
  await startAs(page, "progress");
  await open(page, "/session?minutes=5");

  // The newest words come first, each on its own card.
  // A noun without its article is close: the hint points at the article.
  const first = await asked(page, MEANINGS);

  await answer(page, NOUNS[first].bare);
  await expect(
    page.getByText("The word is right. Is it an en, ei or et word?")
  ).toBeVisible();
  await answer(page, NOUNS[first].full);
  await expect(
    page.getByText("Correct on the second try. It will come back soon.")
  ).toBeVisible();
  await proceed(page);

  // A wrong word gets a hint; giving up shows the answer.
  const second = await asked(
    page,
    MEANINGS.filter((meaning) => meaning !== first)
  );

  await answer(page, "takk");
  await expect(
    page.getByText(`It starts with “${NOUNS[second].bare.slice(0, 1)}…”.`)
  ).toBeVisible();
  await page.getByRole("button", { name: "I don’t know" }).click();
  await expect(page.getByText("Copy it once")).toBeVisible();
  await answer(page, NOUNS[second].full);
  await expect(
    page.getByText("This is the answer. It will come back soon.")
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "It was a typo" })
  ).toBeVisible();
  await proceed(page);

  const third = await asked(
    page,
    MEANINGS.filter((meaning) => meaning !== first && meaning !== second)
  );

  await answer(page, NOUNS[third].full);
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  await proceed(page);

  // Then the older items, inside sentences. A sentence with a word missing may be tried again.
  const sentence = await asked(page, ENGLISH);

  await answer(page, SENTENCES[sentence].short);
  await expect(
    page.getByRole("button", { name: "I don’t know" })
  ).toBeVisible();
  await expect(page.getByLabel("right").first()).toBeVisible();
  await answer(page, SENTENCES[sentence].full);
  await expect(page.getByText("Correct on the second try.")).toBeVisible();
  await expect(page.getByText("to repeat")).toBeVisible();
  await proceed(page);

  // A sentence that is right at once reviews every item in it.
  const next = await asked(
    page,
    ENGLISH.filter((english) => english !== sentence)
  );

  await answer(page, SENTENCES[next].full);
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  await expect(page.getByText("This sentence reviews")).toBeVisible();
  await expect(page.getByText("needs work")).toBeHidden();

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();
});

test("what happens in a session is sent to the journal when the learner leaves", async ({
  page,
}) => {
  const sent: JournalEvent[] = [];

  await page.route("**/api/journal", async (route) => {
    const { events } = v.parse(
      JournalRequestSchema,
      JSON.parse(route.request().postData() ?? "")
    );

    sent.push(...events);
    await route.fulfill({ json: { stored: events.length } });
  });

  await startAs(page, "progress");
  await open(page, "/session?minutes=5");

  const first = await asked(page, MEANINGS);

  await answer(page, NOUNS[first].bare);
  await page.getByRole("button", { name: "Close" }).click();

  await expect
    .poll(() => sent.map((event) => event.kind))
    .toEqual(["session.started", "task.chosen", "task.event", "session.left"]);

  // The task that was chosen, why, and what the learner typed.
  expect(sent[1]?.data).toMatchObject({
    count: 1,
    dueLearning: 3,
    reason: "learning",
    step: "learning",
    task: "card",
  });
  expect(sent[2]?.data).toEqual({
    event: { text: NOUNS[first].bare, type: "answer" },
  });
});

test("a pattern is shown, read and then produced", async ({ page }) => {
  await startAs(page, "beforeThe");
  await open(page, "/session?minutes=5");

  await expect(page.getByText("Step 1 of 3 · See it")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: 'Saying "the"' })
  ).toBeVisible();
  await expect(page.getByText("The rule.")).toBeVisible();
  await proceed(page);

  // Each reading question: a wrong pick is marked and cannot be picked again; the right one moves on.
  await inOrder(READING, async ({ prompt, right, wrong }, at) => {
    await expect(
      page.getByText(`Step 2 of 3 · Read it · ${at + 1} of 3`)
    ).toBeVisible();
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    await option(page, wrong).click();
    await expect(option(page, wrong)).toBeDisabled();
    await option(page, right).click();
  });

  // Three sentences that use the pattern, each typed in Norwegian.
  await inOrder([1, 2, 3], async (place) => {
    await expect(
      page.getByText(`Step 3 of 3 · Produce it · ${place} of 3`)
    ).toBeVisible();

    const sentence = await asked(page, PRACTICE_ENGLISH);

    await answer(page, PRACTICE[sentence]);
    await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
    await proceed(page);
  });

  // The pattern is learned, so the session goes on to the words of the same lesson.
  await expect(page.getByText("Step 1 of 2 · Hear and see")).toBeVisible();
});

test("a story is read, a word is looked up, and its questions are answered", async ({
  page,
}) => {
  await startAs(page, "progress");
  await open(page, "/stories/st1-1");

  await expect(
    page.getByRole("heading", { level: 1, name: "Hvem er hun?" })
  ).toBeVisible();

  // A tapped word shows its meaning.
  await page.getByRole("button", { exact: true, name: "norsk" }).click();
  await expect(page.getByText("Norwegian (language)")).toBeVisible();

  // The English can be shown and hidden.
  await page.getByRole("button", { name: "Show English" }).click();
  await expect(page.getByText("Does she live in Norway?")).toBeVisible();
  await page.getByRole("button", { name: "Hide English" }).click();
  await expect(page.getByText("Does she live in Norway?")).toBeHidden();

  await page.getByRole("button", { name: "Questions" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Where is Maria from?" })
  ).toBeVisible();

  // A wrong pick is marked and the question stays.
  await option(page, "Norway").click();
  await expect(page.getByLabel("wrong")).toBeVisible();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await option(page, "Italy").click();

  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await option(page, "Norwegian and English").click();

  // Back on the list, the story is marked as read.
  await expect(
    page.getByRole("heading", { level: 1, name: "Course" })
  ).toBeVisible();
  await expect(
    page
      .getByRole("link", { name: /Hvem er hun\?/u })
      .filter({ visible: true })
      .getByText("Read", { exact: true })
  ).toBeVisible();
});

test("the sounds drill tells a right pick from a wrong one and keeps score", async ({
  page,
}) => {
  await startAs(page, "empty");
  await open(page, "/sounds");

  await expect(page.getByText("Not practised yet").first()).toBeVisible();
  await page.getByRole("button", { name: "Practise all sounds" }).click();

  await expect(page.getByText("1 of 10")).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Which word do you hear?" })
  ).toBeVisible();
  await expect(soundWords(page)).toHaveCount(2);

  // The second word is the one played (see `startAs`).
  await soundWords(page).nth(1).click();
  await expect(page.getByText("Correct.", { exact: true })).toBeVisible();
  await expect(page.getByText("The word", { exact: true })).toBeVisible();
  await proceed(page);

  await expect(page.getByText("2 of 10")).toBeVisible();
  await soundWords(page).nth(0).click();
  await expect(page.getByText("It was “", { exact: false })).toBeVisible();
  await expect(page.getByText("Your pick", { exact: true })).toBeVisible();

  // Leaving the drill keeps the score of what was answered.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Sounds" })
  ).toBeVisible();
  await expect(page.getByText(/^\d of \d right$/u).first()).toBeVisible();
});

test("Start over needs a long hold, then deletes all progress", async ({
  page,
}) => {
  const learned = (count: number) =>
    page.getByText(`${count} learned items.`, { exact: false });

  const hold = page.getByRole("button", { name: "Hold to delete everything" });

  await startAs(page, "progress");
  await open(page, "/settings");
  await expect(learned(73)).toBeVisible();

  // A tap, or a hold that ends early, leaves everything as it was.
  await hold.click();
  await hold.click({ delay: 500 });
  await expect(page.getByText("All progress deleted.")).toBeHidden();
  await expect(learned(73)).toBeVisible();

  await hold.click({ delay: 2200 });
  await expect(page.getByText("All progress deleted.")).toBeVisible();
  await expect(learned(0)).toBeVisible();

  // Nothing is left on another page either.
  await page.goto("/items");
  await expect(page.getByText("0 of 463 learned in A1.")).toBeVisible();
});
