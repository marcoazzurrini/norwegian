// Starts a test from a learner who has already studied, at a fixed moment, so that the app
// asks the same things on every run. The data comes from `bun screens/write-fixtures.ts`.
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { NOW, writeSeed } from "../screens/learner-data";
import seeds from "./data/seeds.json" with { type: "json" };

/**
 * `empty` has learned nothing. `progress` is some weeks in: three nouns are in their first
 * minutes and several older items are due. `beforeThe` has the pattern 'Saying "the"' next.
 */
export type Learner = keyof typeof seeds;

/** Writes the learner's data into the browser before the app starts, and pins the time and the dice. */
export const startAs = async (page: Page, learner: Learner) => {
  await page.addInitScript(() => {
    // The same "random" number every time: the second of two sounds is the one played.
    Math.random = () => 0.5;
  });
  await page.clock.setFixedTime(NOW);
  // A document of the app's origin that runs none of its code, to write the data from.
  await page.goto("/icon.svg");
  await page.evaluate(writeSeed, seeds[learner]);
};

/** Opens a path of the app and waits for it: the development server builds a page when it is first asked for. */
export const open = async (page: Page, route: string) => {
  await page.goto(route);
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .or(page.getByRole("button", { name: "Close" }))
      .filter({ visible: true })
      .first()
  ).toBeVisible({ timeout: 30_000 });
};

/** The field for an answer. Its name changes after a miss. */
export const answerField = (page: Page) =>
  page.getByRole("textbox", { name: /^(?:Type in Norwegian|Try again)$/u });

export const answer = async (page: Page, text: string) => {
  await answerField(page).fill(text);
  await answerField(page).press("Enter");
};

/** The main action. Where there is a keyboard its name ends with the key that does the same. */
export const proceed = async (page: Page) => {
  await page.getByRole("button", { name: /^Continue/u }).click();
};

/**
 * Waits until the page asks for an answer, and returns the one of the given questions it asks.
 * The questions are the English texts the page may show; each is matched as a whole.
 */
export const asked = async <Question extends string>(
  page: Page,
  questions: readonly Question[]
): Promise<Question> => {
  await expect(answerField(page)).toBeVisible();

  const shown = await Promise.all(
    questions.map(
      async (question) =>
        await page.getByText(question, { exact: true }).isVisible()
    )
  );

  const found = questions.find((_, at) => shown[at] === true);

  if (found === undefined) {
    throw new Error(`The page asks none of: ${questions.join(" / ")}`);
  }

  return found;
};
