import { useState } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { Segmented } from "../src/index";

const LENGTHS = [
  [5, "5 min"],
  [15, "15 min"],
  [25, "25 min"],
] as const;

interface LengthsProps {
  onPick?: (minutes: number) => void;
}

// The component is controlled, so the test keeps the value as a screen would.
const Lengths = ({ onPick }: LengthsProps) => {
  const [minutes, setMinutes] = useState<number>(15);

  return (
    <Segmented
      label="Session length"
      value={minutes}
      options={LENGTHS}
      onPick={(next) => {
        setMinutes(next);
        onPick?.(next);
      }}
    />
  );
};

test("the group is named and shows the chosen option", async () => {
  const screen = await render(<Lengths />);
  const group = screen.getByRole("radiogroup", { name: "Session length" });

  await expect
    .element(group.getByRole("radio", { name: "15 min" }))
    .toBeChecked();
  await expect
    .element(group.getByRole("radio", { name: "5 min", exact: true }))
    .not.toBeChecked();
  await expect
    .element(group.getByRole("radio", { name: "25 min" }))
    .not.toBeChecked();
});

test("a click picks an option and reports its value", async () => {
  const onPick = vi.fn<(minutes: number) => void>();
  const screen = await render(<Lengths onPick={onPick} />);

  await screen.getByRole("radio", { name: "25 min" }).click();

  expect(onPick).toHaveBeenCalledExactlyOnceWith(25);
  await expect
    .element(screen.getByRole("radio", { name: "25 min" }))
    .toBeChecked();
  await expect
    .element(screen.getByRole("radio", { name: "15 min" }))
    .not.toBeChecked();
});

test("the arrow keys move the choice, and wrap at the ends", async () => {
  const onPick = vi.fn<(minutes: number) => void>();
  const screen = await render(<Lengths onPick={onPick} />);

  // Tab lands on the chosen option: the group is one tab stop.
  await userEvent.keyboard("{Tab}");
  await expect
    .element(screen.getByRole("radio", { name: "15 min" }))
    .toHaveFocus();

  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(screen.getByRole("radio", { name: "25 min" }))
    .toBeChecked();

  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(screen.getByRole("radio", { name: "5 min", exact: true }))
    .toBeChecked();

  await userEvent.keyboard("{ArrowLeft}");
  await expect
    .element(screen.getByRole("radio", { name: "25 min" }))
    .toBeChecked();

  expect(onPick.mock.calls).toStrictEqual([[25], [5], [25]]);
});

test("an option that is disabled is shown but cannot be chosen", async () => {
  const onPick = vi.fn<(level: string) => void>();

  const screen = await render(
    <Segmented
      label="Level"
      value="A1"
      options={[
        ["A1", "A1"],
        ["A2", "A2"],
      ]}
      disabled={["A2"]}
      onPick={onPick}
    />
  );

  const locked = screen.getByRole("radio", { name: "A2" });

  await expect.element(locked).toBeDisabled();
  await locked.click({ force: true });

  expect(onPick).not.toHaveBeenCalled();
});

test("the pill lies over the chosen option and moves with the choice", async () => {
  const screen = await render(<Lengths />);
  const group = screen.getByRole("radiogroup").element();

  /** The left edge of the visible part of the pill, from its clip path. */
  const pillLeft = (): number => {
    const pill = group.querySelector("span[aria-hidden]");
    const clip = pill instanceof HTMLElement ? pill.style.clipPath : "";

    return Number(
      /inset\(\S+ \S+ \S+ (?<left>[\d.]+)px/u.exec(clip)?.groups?.left
    );
  };

  const leftOf = (name: string): number => {
    const option = screen.getByRole("radio", { name }).element();

    return option instanceof HTMLElement ? option.offsetLeft : Number.NaN;
  };

  await expect.poll(pillLeft).toBe(leftOf("15 min"));

  await screen.getByRole("radio", { name: "25 min" }).click();

  await expect.poll(pillLeft).toBe(leftOf("25 min"));
});
