// Compares two sets of pictures taken by capture.ts, pixel by pixel:
//   bun screens/compare.ts baseline current
//
// The rule is the one the component library was checked with: a colour channel of a pixel may
// differ by at most 2 of 255, which is what the browser's own blending of an edge can vary by.
// Anything a person could see, such as a wrong size, colour or position, moves pixels by far more.
// A picture that differs gets a `.diff.png` beside it: grey where the two agree, red where not.
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";
import type { Page } from "@playwright/test";

const OUTPUT = path.join(import.meta.dirname, "output");
const CHANNEL_TOLERANCE = 2;

interface Difference {
  /** Null when the two pictures have different sizes. */
  marked: string | null;
  /** The largest difference in one colour channel, of 255. */
  largest: number;
  /** Pixels that differ at all. */
  touched: number;
  size: string;
  /** The rectangle that holds every pixel that differs: left, top, right, bottom. */
  box: string;
}

interface Pair {
  /** The two pictures, as base64 text. */
  before: string;
  after: string;
}

/** Runs inside a browser page, which can read a PNG without a library. */
const differenceInPage = async ({ before, after }: Pair) => {
  const [old, next] = await Promise.all(
    [before, after].map(async (encoded) => {
      const bytes = Uint8Array.from(
        atob(encoded),
        (char) => char.codePointAt(0) ?? 0
      );

      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/png" })
      );

      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");

      if (context === null) {
        throw new Error("The browser gave no canvas");
      }

      context.drawImage(bitmap, 0, 0);

      return context.getImageData(0, 0, bitmap.width, bitmap.height);
    })
  );

  if (old === undefined || next === undefined) {
    throw new Error("A picture could not be read");
  }

  if (old.width !== next.width || old.height !== next.height) {
    return {
      box: "all of it",
      largest: 255,
      marked: null,
      size: `${old.width}×${old.height} against ${next.width}×${next.height}`,
      touched: old.width * old.height,
    };
  }

  const marked = new ImageData(old.width, old.height);
  let touched = 0;
  let largest = 0;
  let left = old.width;
  let top = old.height;
  let right = 0;
  let bottom = 0;

  for (let at = 0; at < old.data.length; at += 4) {
    const delta = Math.max(
      Math.abs((old.data[at] ?? 0) - (next.data[at] ?? 0)),
      Math.abs((old.data[at + 1] ?? 0) - (next.data[at + 1] ?? 0)),
      Math.abs((old.data[at + 2] ?? 0) - (next.data[at + 2] ?? 0))
    );

    const grey = 255 - Math.floor((old.data[at] ?? 0) / 4);

    marked.data[at] = delta > 0 ? 255 : grey;
    marked.data[at + 1] = delta > 0 ? 0 : grey;
    marked.data[at + 2] = delta > 0 ? 0 : grey;
    marked.data[at + 3] = 255;
    largest = Math.max(largest, delta);

    if (delta > 0) {
      const x = (at / 4) % old.width;
      const y = Math.floor(at / 4 / old.width);

      touched += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  const canvas = new OffscreenCanvas(old.width, old.height);

  canvas.getContext("2d")?.putImageData(marked, 0, 0);

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return {
    box: `${left},${top} to ${right},${bottom}`,
    largest,
    marked: btoa(binary),
    size: `${old.width}×${old.height}`,
    touched,
  };
};

const picturesIn = async (set: string): Promise<string[]> => {
  const files = await readdir(path.join(OUTPUT, set), { recursive: true });

  return files
    .filter((file) => file.endsWith(".png") && !file.endsWith(".diff.png"))
    .toSorted();
};

interface Verdict {
  file: string;
  line: string;
  identical: boolean;
  pass: boolean;
}

const judge = async (
  page: Page,
  before: string,
  after: string,
  file: string
): Promise<Verdict> => {
  const diffFile = path.join(
    OUTPUT,
    after,
    file.replace(/\.png$/u, ".diff.png")
  );

  const old = Bun.file(path.join(OUTPUT, before, file));
  const next = Bun.file(path.join(OUTPUT, after, file));

  await rm(diffFile, { force: true });

  if (!(await next.exists())) {
    return {
      file,
      identical: false,
      line: "missing in the new set",
      pass: false,
    };
  }

  const [oldBytes, nextBytes] = await Promise.all([old.bytes(), next.bytes()]);

  // The same bytes are the same picture; only the others need to be read pixel by pixel.
  if (Buffer.compare(oldBytes, nextBytes) === 0) {
    return { file, identical: true, line: "identical", pass: true };
  }

  const difference: Difference = await page.evaluate(differenceInPage, {
    after: Buffer.from(nextBytes).toString("base64"),
    before: Buffer.from(oldBytes).toString("base64"),
  });

  if (difference.touched === 0) {
    return { file, identical: true, line: "identical", pass: true };
  }

  if (difference.marked !== null) {
    await writeFile(diffFile, Buffer.from(difference.marked, "base64"));
  }

  return {
    file,
    identical: false,
    line: `${difference.size}: ${difference.touched} pixels differ in ${difference.box}, by at most ${difference.largest} of 255`,
    pass: difference.largest <= CHANNEL_TOLERANCE,
  };
};

/** One picture after another: the page reads two large pictures at a time. */
const judgeAll = async (
  page: Page,
  before: string,
  after: string,
  files: string[],
  done: Verdict[] = []
): Promise<Verdict[]> => {
  const [file, ...others] = files;

  if (file === undefined) {
    return done;
  }

  const verdict = await judge(page, before, after, file);

  return await judgeAll(page, before, after, others, [...done, verdict]);
};

const [before, after, ...wanted] = process.argv.slice(2);

if (before === undefined || after === undefined) {
  throw new Error("Name two sets: bun screens/compare.ts <before> <after>");
}

const all = await picturesIn(before);

const files = all.filter(
  (file) =>
    wanted.length === 0 ||
    wanted.some((start) => path.basename(file).startsWith(start))
);

const inAfter = await picturesIn(after);
const extra = inAfter.filter((file) => !all.includes(file));

const browser = await chromium.launch();
const page = await browser.newPage();
const verdicts = await judgeAll(page, before, after, files);

await browser.close();

const failed = verdicts.filter((verdict) => !verdict.pass);
const noisy = verdicts.filter((verdict) => verdict.pass && !verdict.identical);

for (const { file, line } of [...noisy, ...failed]) {
  console.log(
    `${failed.some((verdict) => verdict.file === file) ? "DIFFERENT" : "noise    "} ${file}  ${line}`
  );
}

for (const file of extra) {
  console.log(`only in ${after}: ${file}`);
}

console.log(
  `\n${verdicts.length} pictures: ${verdicts.filter((verdict) => verdict.identical).length} identical, ${noisy.length} within the noise allowed, ${failed.length} different.`
);

process.exit(failed.length === 0 ? 0 : 1);
