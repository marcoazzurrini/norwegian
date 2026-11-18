import * as stylex from "@stylexjs/stylex";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Button, Key, ListCard, useDesktop } from "../src/index";
import { color } from "../src/tokens/tokens.stylex";

// base.css cannot read the StyleX tokens, so it repeats four colours. These swatches carry the
// tokens, and the tests below hold the two in step.
const swatches = stylex.create({
  base: { backgroundColor: color.base },
  fg: { color: color.fg },
  line: { color: color.line },
  panel: { backgroundColor: color.panel },
});

const shown = (label: string) => page.getByLabelText(label).element();

const Swatches = () => (
  <>
    <div aria-label="panel" {...stylex.props(swatches.panel)} />
    <div aria-label="base" {...stylex.props(swatches.base)} />
    <div aria-label="fg" {...stylex.props(swatches.fg)} />
    <div aria-label="line" {...stylex.props(swatches.line)} />
  </>
);

test("the document colours in base.css are the token colours", async () => {
  await page.viewport(393, 852);
  await render(<Swatches />);

  const root = document.documentElement;

  await expect
    .poll(() => getComputedStyle(root).backgroundColor)
    .toBe(getComputedStyle(shown("panel")).backgroundColor);

  expect(getComputedStyle(document.body).color).toBe(
    getComputedStyle(shown("fg")).color
  );

  // From the desktop width on, the document takes the darker colour around the panel.
  await page.viewport(1440, 900);

  await expect
    .poll(() => getComputedStyle(root).backgroundColor)
    .toBe(getComputedStyle(shown("base")).backgroundColor);
});

test("the hairline between list rows has the line colour", async () => {
  const screen = await render(
    <>
      <Swatches />
      <ListCard>
        <div>First</div>
        <div>Second</div>
      </ListCard>
    </>
  );

  const first = getComputedStyle(screen.getByText("First").element());
  const second = getComputedStyle(screen.getByText("Second").element());

  expect(first.borderTopWidth).toBe("0px");
  expect(second.borderTopWidth).toBe("1px");
  expect(second.borderTopColor).toBe(getComputedStyle(shown("line")).color);
});

test("the text size setting scales the components", async () => {
  const screen = await render(<Button>Continue</Button>);
  const button = screen.getByRole("button", { name: "Continue" }).element();
  const size = () => button.getBoundingClientRect();
  const before = { height: size().height, width: size().width };

  // The app sets this on the document when the learner changes the setting.
  document.documentElement.style.setProperty("--text-scale", "1.25");

  try {
    expect(size().height).toBeCloseTo(before.height * 1.25, 1);

    // Letter widths are rounded by the font at each size, so the width follows only roughly.
    expect(size().width / before.width).toBeGreaterThan(1.22);
    expect(size().width / before.width).toBeLessThan(1.28);
  } finally {
    document.documentElement.style.removeProperty("--text-scale");
  }
});

test("a key hint is shown where there is a keyboard", async () => {
  const screen = await render(<Key>1</Key>);

  // The test browser has a mouse and a keyboard; on a touch screen the same rule hides it.
  await expect.element(screen.getByText("1")).toBeVisible();
});

const Layout = () => <p>{useDesktop() ? "wide" : "narrow"}</p>;

test("useDesktop follows the width of the window", async () => {
  await page.viewport(393, 852);

  const screen = await render(<Layout />);

  await expect.element(screen.getByText("narrow")).toBeVisible();

  await page.viewport(1440, 900);
  await expect.element(screen.getByText("wide")).toBeVisible();
});
