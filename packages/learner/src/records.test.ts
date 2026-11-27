import { expect, test } from "bun:test";

import * as v from "valibot";

import { SavedMetaSchema } from "./records";

const minutesOf = (minutes: number | string): number =>
  v.parse(SavedMetaSchema, { settings: { minutes } }).settings.minutes;

test("a saved session length the app no longer offers reads as the length that took its place", () => {
  // Saved on this device, or sent by the server from a device with an older version of the app.
  expect(minutesOf(25)).toBe(30);
  expect(minutesOf(40)).toBe(60);
});

test("a saved session length the app offers reads as it is", () => {
  for (const minutes of [5, 15, 30, 60]) {
    expect(minutesOf(minutes)).toBe(minutes);
  }
});

test("an unreadable session length reads as the default", () => {
  expect(minutesOf("many")).toBe(15);
});
