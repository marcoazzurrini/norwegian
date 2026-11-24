import { describe, expect, test } from "bun:test";

import { typicalMs, withTime } from "./index";
import type { Pace } from "./index";

const paceOf = (times: number[]): Pace => {
  let pace: Pace = {};

  for (const ms of times) {
    pace = withTime(pace, "card", ms);
  }

  return pace;
};

describe("the pace of the learner", () => {
  test("the usual time of a task is the middle one of the latest times", () => {
    expect(typicalMs(paceOf([9000]), "card")).toBe(9000);
    expect(typicalMs(paceOf([6000, 9000, 7000]), "card")).toBe(7000);
    expect(typicalMs(paceOf([6000, 9000, 7000, 8000]), "card")).toBe(7500);
  });

  test("a task left open during a break changes nothing", () => {
    const steady = [7000, 6000, 8000, 7000, 7000];

    expect(typicalMs(paceOf([...steady, 180_000]), "card")).toBe(
      typicalMs(paceOf(steady), "card")
    );
  });

  test("only the latest times count", () => {
    const slowThenFast = [
      ...Array.from({ length: 20 }, () => 20_000),
      ...Array.from({ length: 20 }, () => 5000),
    ];

    expect(typicalMs(paceOf(slowThenFast), "card")).toBe(5000);
    expect(paceOf(slowThenFast).card).toHaveLength(20);
  });

  test("a kind of work the learner has not done yet has a time to start from", () => {
    const pace = paceOf([7000]);

    expect(typicalMs(pace, "sentence")).toBeGreaterThan(0);
    expect(typicalMs({}, "card")).toBeGreaterThan(0);
    // One kind of work says nothing about another.
    expect(typicalMs(pace, "sentence")).toBe(typicalMs({}, "sentence"));
  });
});
