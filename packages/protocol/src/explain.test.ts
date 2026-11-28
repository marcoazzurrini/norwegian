// The explain request must be read from this version of the app and from every earlier one.
import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { ExplainRequestSchema, FIRST_COURSE } from "./index";

describe("the explain request, across versions", () => {
  test("names its course and the two texts", () => {
    const request = {
      answer: "ich bin ein haus",
      base: "I have a house.",
      course: "de",
      kind: "hint",
      target: "Ich habe ein Haus.",
      topics: ["haben (to have)"],
    };

    const parsed = v.parse(ExplainRequestSchema, request);

    expect(parsed.course).toBe("de");
    expect(parsed.base).toBe("I have a house.");
    expect(parsed.target).toBe("Ich habe ein Haus.");
    expect(parsed.topics).toEqual(["haben (to have)"]);
  });

  test("from before there were courses, it is a request of the first course", () => {
    const old = {
      answer: "jeg er et hus",
      en: "I have a house.",
      kind: "explain",
      no: "Jeg har et hus.",
      topics: [],
    };

    expect(v.parse(ExplainRequestSchema, old)).toEqual({
      answer: "jeg er et hus",
      base: "I have a house.",
      course: FIRST_COURSE,
      differences: [],
      kind: "explain",
      target: "Jeg har et hus.",
      topics: [],
    });
  });

  test("a course id that could not stand in an address is refused", () => {
    const request = {
      answer: "x",
      base: "x",
      course: "../etc",
      kind: "hint",
      target: "x",
      topics: [],
    };

    expect(v.is(ExplainRequestSchema, request)).toBe(false);
  });
});
