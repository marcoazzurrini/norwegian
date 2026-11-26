import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { HoldButton } from "../src/index";

test("a tap does nothing; a hold of two seconds calls back once", async () => {
  const onHeld = vi.fn<() => void>();

  const screen = await render(
    <HoldButton onHeld={onHeld}>Hold to delete</HoldButton>
  );

  const button = screen.getByRole("button", { name: "Hold to delete" });

  await button.click();
  await button.click({ delay: 300 });

  expect(onHeld).not.toHaveBeenCalled();

  await button.click({ delay: 2200 });

  expect(onHeld).toHaveBeenCalledOnce();
});
