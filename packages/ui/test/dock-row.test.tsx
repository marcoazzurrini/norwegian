import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Button, DockRow } from "../src/index";

const widthOf = (element: Element) => element.getBoundingClientRect().width;

test("on a phone two actions share the width of the row", async () => {
  await page.viewport(393, 852);

  const screen = await render(
    <DockRow>
      <Button variant="secondary">Play again</Button>
      <Button>Continue</Button>
    </DockRow>
  );

  const quiet = screen.getByRole("button", { name: "Play again" }).element();
  const main = screen.getByRole("button", { name: "Continue" }).element();

  expect(widthOf(quiet)).toBeCloseTo(widthOf(main), 1);
  // Together with the gap between them they fill the row.
  expect(widthOf(quiet) + widthOf(main)).toBeGreaterThan(360);
});

test("on a phone an action beside an empty place takes more than half of the row", async () => {
  await page.viewport(393, 852);

  const screen = await render(
    <DockRow>
      <span data-testid="empty" />
      <Button>Continue</Button>
    </DockRow>
  );

  const empty = screen.getByTestId("empty").element();
  const main = screen.getByRole("button", { name: "Continue" }).element();

  // Each child grows by the same amount, and the button starts from its own padding.
  expect(widthOf(main)).toBeGreaterThan(widthOf(empty));
  expect(widthOf(main) - widthOf(empty)).toBeCloseTo(44, 0);
});

test("on a wide screen the actions keep their own width and sit at the two ends", async () => {
  await page.viewport(1440, 900);

  const screen = await render(
    <DockRow>
      <Button variant="secondary">Play again</Button>
      <Button>Continue</Button>
    </DockRow>
  );

  const quiet = screen
    .getByRole("button", { name: "Play again" })
    .element()
    .getBoundingClientRect();

  const main = screen
    .getByRole("button", { name: "Continue" })
    .element()
    .getBoundingClientRect();

  expect(quiet.left).toBeLessThan(10);
  expect(main.right).toBeGreaterThan(1400);
  expect(quiet.width).toBeLessThan(200);
  expect(main.width).toBeLessThan(200);
});
