import * as stylex from "@stylexjs/stylex";
import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";

import { AudioButton } from "../src/index";

const styles = stylex.create({
  large: { height: "5rem", width: "5rem" },
  smallIcon: { height: "25%", width: "25%" },
});

test("a press asks the caller to play, and the label names the button", async () => {
  const onPlay = vi.fn<() => void>();

  const screen = await render(
    <AudioButton onPlay={onPlay} label="Play the word" />
  );

  await screen.getByRole("button", { name: "Play the word" }).click();
  expect(onPlay).toHaveBeenCalledOnce();
});

test("the caller sets the size of the button and of the icon inside it", async () => {
  const onPlay = vi.fn<() => void>();

  const screen = await render(
    <AudioButton
      onPlay={onPlay}
      style={styles.large}
      iconStyle={styles.smallIcon}
    />
  );

  const button = screen.getByRole("button", { name: "Play audio" }).element();
  const icon = button.querySelector("svg");

  expect(button.getBoundingClientRect().width).toBe(80);
  expect(icon?.getBoundingClientRect().width).toBe(20);
});
