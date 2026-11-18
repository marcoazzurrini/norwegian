import { expect, test } from "bun:test";

import type { Token } from "@norsk/content";

import { belongsTo, splitLine } from "./text-parts";

const tokens: Token[] = [
  { t: "Ja", w: "w:ja" },
  { t: "hun", w: "w:hun" },
  { c: "c:bor-i", t: "bor" },
  { c: "c:bor-i", t: "i" },
  { free: true, t: "Bergen" },
];

test("a line is cut into words and what stands between them", () => {
  const parts = splitLine("Ja, hun bor i Bergen.", tokens);

  expect(parts.map((part) => part.text)).toEqual([
    "Ja",
    ", ",
    "hun",
    " ",
    "bor",
    " ",
    "i",
    " ",
    "Bergen",
    ".",
  ]);
  expect(parts.map((part) => part.text).join("")).toBe("Ja, hun bor i Bergen.");
  expect(parts.map((part) => part.index)).toEqual([
    0, -1, 1, -1, 2, -1, 3, -1, 4, -1,
  ]);
  expect(new Set(parts.map((part) => part.start)).size).toBe(parts.length);
});

test("a word is found after the one before it, even if it occurs earlier", () => {
  const parts = splitLine("i dag bor du i Oslo", [{ t: "bor" }, { t: "i" }]);

  expect(parts.map((part) => [part.text, part.index])).toEqual([
    ["i dag ", -1],
    ["bor", 0],
    [" du ", -1],
    ["i", 1],
    [" Oslo", -1],
  ]);
});

test("a token that is not in the line is left out", () => {
  const parts = splitLine("Hei du", [{ t: "Hei" }, { t: "deg" }, { t: "du" }]);

  expect(parts.map((part) => [part.text, part.index])).toEqual([
    ["Hei", 0],
    [" ", -1],
    ["du", 2],
  ]);
});

test("a word belongs to its own item and to the phrase it is part of", () => {
  const parts = splitLine("Ja, hun bor i Bergen.", tokens);
  const ja = parts.find((part) => part.text === "Ja");
  const bor = parts.find((part) => part.text === "bor");

  expect(ja !== undefined && belongsTo(ja, "w:ja")).toBe(true);
  expect(bor !== undefined && belongsTo(bor, "c:bor-i")).toBe(true);
  expect(bor !== undefined && belongsTo(bor, "w:ja")).toBe(false);
});
