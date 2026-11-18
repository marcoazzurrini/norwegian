import { useState } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { AnswerInput } from "../src/index";

interface ComposerProps {
  start?: string;
  onSubmit?: (value: string) => void;
}

// The component is controlled, so the test keeps the value as a task would.
const Composer = ({ start = "", onSubmit }: ComposerProps) => {
  const [value, setValue] = useState(start);

  return (
    <AnswerInput
      value={value}
      onChange={setValue}
      onSubmit={() => {
        onSubmit?.(value);
      }}
    />
  );
};

test("the field is named by its placeholder and takes focus", async () => {
  const screen = await render(<Composer />);
  const field = screen.getByRole("textbox", { name: "Type in Norwegian" });

  await expect.element(field).toHaveFocus();
  await expect
    .element(field)
    .toHaveAttribute("placeholder", "Type in Norwegian");
});

test("a letter button inserts its letter at the caret", async () => {
  const screen = await render(<Composer start="bl br" />);
  const field = screen.getByRole("textbox", { name: "Type in Norwegian" });

  // Put the caret between "bl" and " br".
  await userEvent.keyboard("{Home}{ArrowRight}{ArrowRight}");
  await screen.getByRole("button", { name: "Insert å" }).click();
  await expect.element(field).toHaveValue("blå br");

  // The caret stays after the new letter, so typing goes on from there.
  await expect.element(field).toHaveFocus();
  await userEvent.keyboard("tt");
  await expect.element(field).toHaveValue("blått br");

  await userEvent.keyboard("{End}");
  await screen.getByRole("button", { name: "Insert ø" }).click();
  await screen.getByRole("button", { name: "Insert æ" }).click();
  await expect.element(field).toHaveValue("blått brøæ");
});

test("a letter button replaces the selected text", async () => {
  const screen = await render(<Composer start="ga" />);
  const field = screen.getByRole("textbox", { name: "Type in Norwegian" });

  await userEvent.keyboard("{End}{Shift>}{ArrowLeft}{/Shift}");
  await screen.getByRole("button", { name: "Insert å" }).click();

  await expect.element(field).toHaveValue("gå");
});

test("Enter and the send button submit the answer", async () => {
  const onSubmit = vi.fn<(value: string) => void>();
  const screen = await render(<Composer onSubmit={onSubmit} />);

  await userEvent.keyboard("takk{Enter}");
  expect(onSubmit).toHaveBeenLastCalledWith("takk");

  await screen.getByRole("button", { name: "Check the answer" }).click();
  expect(onSubmit).toHaveBeenCalledTimes(2);
});

test("nothing can be sent while the field is empty", async () => {
  const onSubmit = vi.fn<(value: string) => void>();
  const screen = await render(<Composer onSubmit={onSubmit} />);
  const send = screen.getByRole("button", { name: "Check the answer" });

  await expect.element(send).toBeDisabled();

  // Spaces alone are still nothing.
  await userEvent.keyboard("  {Enter}");
  await expect.element(send).toBeDisabled();
  expect(onSubmit).not.toHaveBeenCalled();

  await userEvent.keyboard("ja");
  await expect.element(send).toBeEnabled();
});
