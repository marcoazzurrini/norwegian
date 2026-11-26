// What a learner can see and do. These tests must keep passing while the code underneath is reorganised.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** The value shown above a label in a statistics card. */
const stat = (page: Page, label: string) =>
  page
    .getByText(label, { exact: true })
    .locator("xpath=preceding-sibling::div[1]");

/** A link in whichever navigation the screen size shows: the sidebar or the tab bar. */
const nav = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name })
    .filter({ visible: true });

/** Runs a step for each value, one after another: steps in a browser cannot overlap. */
const inOrder = async <T>(
  values: readonly T[],
  step: (value: T) => Promise<void>
) => {
  for (const value of values) {
    // oxlint-disable-next-line no-await-in-loop -- the steps must not run at the same time
    await step(value);
  }
};

/** Opens a path of the app and waits for it: the development server builds a page, and the course, when first asked for. */
const open = async (page: Page, path = "/") => {
  await page.goto(path);
  await expect(
    page
      .getByRole("link", { name: "Start session" })
      .or(page.getByRole("heading", { level: 1 }))
      .first()
  ).toBeVisible({ timeout: 30_000 });
};

test("a new learner sees an empty Today page", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();
  await expect(page.getByText("New words to learn.")).toBeVisible();
  await expect(stat(page, "Learning")).toHaveText("0");
  await expect(stat(page, "Stable")).toHaveText("0");
  await expect(page.getByText("Unit 1, ", { exact: false })).toContainText(
    "Greetings"
  );
});

test("every page opens from the navigation", async ({ page }) => {
  await open(page);

  await inOrder(["Map", "Stories", "Sounds", "Items"], async (name) => {
    await nav(page, name).click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  });

  await page
    .getByRole("link", { name: "Settings" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" })
  ).toBeVisible();
  await nav(page, "Today").click();
  await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();
});

test("a first session teaches a long phrase alone and short words together, and keeps them after a reload", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("radio", { name: "5 min", exact: true }).click();
  await page.getByRole("link", { name: "Start session" }).click();

  const answer = page.getByRole("textbox", { name: "Type in Norwegian" });

  // A phrase of three new words asks as much as three words, so it comes on its own.
  const groups = [
    [{ meaning: "hi", word: "hei" }],
    [{ meaning: "goodbye", word: "ha det bra" }],
    [
      { meaning: "thanks", word: "takk" },
      { meaning: "yes", word: "ja" },
      { meaning: "no", word: "nei" },
    ],
  ];

  await inOrder(groups, async (group) => {
    // Step 1: each new word of the group is shown.
    await inOrder(group, async ({ word }) => {
      await expect(
        page.getByText("Step 1 of 2", { exact: false })
      ).toBeVisible();
      await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
    });

    // Step 2: each word is typed from its meaning.
    await inOrder(group, async ({ meaning, word }) => {
      await expect(
        page.getByText("Step 2 of 2", { exact: false })
      ).toBeVisible();
      await expect(page.getByText(meaning, { exact: true })).toBeVisible();
      await answer.fill(word);
      await answer.press("Enter");
      await expect(
        page.getByText("Correct. It comes back in a few minutes.")
      ).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
    });
  });

  await page.getByRole("button", { name: "Close" }).click();
  await expect(stat(page, "Learning")).toHaveText("5");

  await page.reload();
  await expect(stat(page, "Learning")).toHaveText("5");
});

test("a wrong answer gets a hint, then the answer to copy", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("radio", { name: "5 min", exact: true }).click();
  await page.getByRole("link", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  const answer = page.getByRole("textbox", { name: "Type in Norwegian" });
  await answer.fill("nei");
  await answer.press("Enter");
  await expect(page.getByText("Not yet.")).toBeVisible();
  await answer.fill("nei");
  await answer.press("Enter");
  await expect(page.getByText("Copy it once")).toBeVisible();
  await answer.fill("hei");
  await answer.press("Enter");
  await expect(
    page.getByText("Correct. It comes back in a few minutes.")
  ).toBeVisible();
});

test("a learner who draws a blank can ask for a hint, or for the answer", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("radio", { name: "5 min", exact: true }).click();
  await page.getByRole("link", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: "Hint" }).click();
  await expect(page.getByText("It starts with “h…”. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hint" })).toBeHidden();

  await page.getByRole("button", { name: "I don’t know" }).click();
  await expect(page.getByText("Copy it once")).toBeVisible();
  await expect(page.getByRole("button", { name: "I don’t know" })).toBeHidden();
});

test("the session length is remembered", async ({ page }) => {
  await open(page, "/settings");
  const group = page.getByRole("radiogroup", { name: "Session length" });
  await group.getByRole("radio", { name: "25 min" }).click();
  await expect(group.getByRole("radio", { name: "25 min" })).toBeChecked();
  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", { name: "Session length" })
      .getByRole("radio", { name: "25 min" })
  ).toBeChecked();
});

test("the items list can be searched", async ({ page }) => {
  await open(page, "/items");
  await page.getByRole("textbox", { name: "Search items" }).fill("takk");
  await expect(
    page.getByText("thanks", { exact: true }).filter({ visible: true }).first()
  ).toBeVisible();
});
