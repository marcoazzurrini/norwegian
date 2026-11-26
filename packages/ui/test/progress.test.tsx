import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

import { Progress } from "../src/index";

/** The part of the track that the fill covers. The fill is moved, not resized. */
const covered = (track: Element, fill: Element | null): number => {
  const whole = track.getBoundingClientRect();

  return (
    ((fill?.getBoundingClientRect().right ?? 0) - whole.left) / whole.width
  );
};

test("the bar reports its value as a percentage", async () => {
  const screen = await render(<Progress value={0.5} />);
  const bar = screen.getByRole("progressbar");

  await expect.element(bar).toHaveAttribute("aria-valuenow", "50");
  await expect.element(bar).toHaveAttribute("aria-valuemin", "0");
  await expect.element(bar).toHaveAttribute("aria-valuemax", "100");
});

test("the value is reported as a whole percentage", async () => {
  const screen = await render(<Progress value={2 / 3} />);

  await expect
    .element(screen.getByRole("progressbar"))
    .toHaveAttribute("aria-valuenow", "67");
});

test("the fill covers the same part of the track as the value", async () => {
  const screen = await render(<Progress value={0.125} />);
  const track = screen.getByRole("progressbar").element();
  const fill = track.firstElementChild;

  expect(fill).not.toBeNull();
  expect(track.getBoundingClientRect().width).toBeGreaterThan(0);

  await expect.poll(() => covered(track, fill)).toBeCloseTo(0.125, 3);
});

test("a bar with a start moves from there to its value", async () => {
  const screen = await render(<Progress value={0.75} from={0.25} />);
  const track = screen.getByRole("progressbar").element();
  const fill = track.firstElementChild;

  // The value is reported at once; only the drawing takes time.
  await expect
    .element(screen.getByRole("progressbar"))
    .toHaveAttribute("aria-valuenow", "75");

  expect(covered(track, fill)).toBeLessThan(0.75);

  await expect.poll(() => covered(track, fill)).toBeCloseTo(0.75, 3);
});

test("a value outside 0 to 1 is clamped", async () => {
  const screen = await render(
    <>
      <Progress value={1.7} />
      <Progress value={-3} />
    </>
  );

  const bars = screen.getByRole("progressbar");

  await expect.element(bars.nth(0)).toHaveAttribute("aria-valuenow", "100");
  await expect.element(bars.nth(1)).toHaveAttribute("aria-valuenow", "0");
});
