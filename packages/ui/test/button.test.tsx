import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { Button } from "../src/index";

test("a button shows the key that does the same thing", async () => {
  const screen = await render(<Button hint="↵">Continue</Button>);
  const button = screen.getByRole("button", { name: /Continue/u });

  await expect.element(button).toBeVisible();
  await expect.element(button.getByText("↵")).toBeVisible();
});

test("a button without a hint has no key cap", async () => {
  const screen = await render(<Button>Continue</Button>);

  // Without a hint the name is the text alone; with one, the key is part of the name.
  await expect
    .element(screen.getByRole("button", { name: "Continue", exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("↵")).not.toBeInTheDocument();
});

test("a press calls back, unless the button is disabled", async () => {
  const onClick = vi.fn<() => void>();

  const screen = await render(
    <>
      <Button onClick={onClick}>Skip</Button>
      <Button disabled onClick={onClick}>
        Wait
      </Button>
    </>
  );

  await screen.getByRole("button", { name: "Skip" }).click();
  await expect
    .element(screen.getByRole("button", { name: "Wait" }))
    .toBeDisabled();
  expect(onClick).toHaveBeenCalledOnce();
});
