import { useState } from "react";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { Choices } from "../src/index";

const OPTIONS = ["a house", "a car", "a boat"] as const;

interface QuestionProps {
  answer: string;
  onPick?: (option: string) => void;
  onNext?: () => void;
}

// The component is controlled, so the test keeps the picks as a task machine would.
const Question = ({ answer, onPick, onNext }: QuestionProps) => {
  const [wrong, setWrong] = useState<readonly string[]>([]);
  const [answered, setAnswered] = useState(false);

  return (
    <Choices
      options={OPTIONS}
      answer={answer}
      wrong={wrong}
      answered={answered}
      onPick={(option) => {
        onPick?.(option);

        if (option === answer) {
          setAnswered(true);
        } else {
          setWrong((before) => [...before, option]);
        }
      }}
      onNext={() => {
        onNext?.();
      }}
    />
  );
};

test("a wrong pick is marked and the learner can try again", async () => {
  const onPick = vi.fn<(option: string) => void>();
  const onNext = vi.fn<() => void>();

  const screen = await render(
    <Question answer="a house" onPick={onPick} onNext={onNext} />
  );

  await screen.getByRole("button", { name: /a car/u }).click();

  // The wrong option is marked and can no longer be picked.
  const wrong = screen.getByRole("button", { name: /a car/u });

  await expect.element(wrong).toBeDisabled();
  await expect.element(wrong.getByLabelText("wrong")).toBeVisible();
  expect(onPick).toHaveBeenCalledExactlyOnceWith("a car");

  // The others are still open, and a wrong pick does not move the task on.
  await expect
    .element(screen.getByRole("button", { name: /a boat/u }))
    .toBeEnabled();
  await screen.getByRole("button", { name: /a house/u }).click();

  expect(onPick).toHaveBeenLastCalledWith("a house");
  expect(onNext).not.toHaveBeenCalled();

  await expect
    .element(
      screen.getByRole("button", { name: /a house/u }).getByLabelText("right")
    )
    .toBeVisible();
  await expect.poll(() => onNext).toHaveBeenCalledOnce();
});

test("the right pick is marked first, and the task moves on once after a short pause", async () => {
  const onNext = vi.fn<() => void>();
  const screen = await render(<Question answer="a boat" onNext={onNext} />);

  await screen.getByRole("button", { name: /a boat/u }).click();

  await expect
    .element(
      screen.getByRole("button", { name: /a boat/u }).getByLabelText("right")
    )
    .toBeVisible();
  expect(onNext).not.toHaveBeenCalled();

  await expect.poll(() => onNext).toHaveBeenCalledOnce();
});

test("the number keys pick the option with that number", async () => {
  const onPick = vi.fn<(option: string) => void>();
  const screen = await render(<Question answer="a boat" onPick={onPick} />);

  await userEvent.keyboard("2");
  expect(onPick).toHaveBeenCalledExactlyOnceWith("a car");
  await expect
    .element(screen.getByRole("button", { name: /a car/u }))
    .toBeDisabled();

  // A key with no option does nothing, and neither does the key of a marked option.
  await userEvent.keyboard("9");
  await userEvent.keyboard("2");
  expect(onPick).toHaveBeenCalledOnce();

  await userEvent.keyboard("3");
  expect(onPick).toHaveBeenLastCalledWith("a boat");
});

test("the given state is what is shown", async () => {
  const screen = await render(
    <Choices
      options={OPTIONS}
      answer="a house"
      wrong={["a boat"]}
      answered={false}
      onPick={vi.fn<(option: string) => void>()}
      onNext={vi.fn<() => void>()}
    />
  );

  await expect
    .element(screen.getByRole("button", { name: /a boat/u }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: /a house/u }))
    .toBeEnabled();
  await expect.element(screen.getByLabelText("right")).not.toBeInTheDocument();
});
