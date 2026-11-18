import { expect, test } from "bun:test";

import { sounds } from "@norsk/content";

import {
  DRILL_LENGTH,
  drillFrom,
  soundGroups,
  voicesNote,
} from "./sound-drill";

test("the pairs are grouped by the contrast they train", () => {
  const groups = soundGroups(sounds);

  expect(groups.map((group) => group.id)).toEqual([
    ...new Set(sounds.map((pair) => pair.group)),
  ]);
  expect(groups.flatMap((group) => group.pairs)).toHaveLength(sounds.length);

  for (const group of groups) {
    expect(group.pairs.every((pair) => pair.group === group.id)).toBe(true);
  }
});

test("a drill has ten questions from the given pairs", () => {
  const [group] = soundGroups(sounds);
  const pairs = group?.pairs ?? [];
  const drill = drillFrom(pairs, () => 0.3);

  expect(drill).toHaveLength(DRILL_LENGTH);
  expect(drill.every((question) => pairs.includes(question.pair))).toBe(true);
  expect(drill.every((question) => question.target === "a")).toBe(true);
  expect(drillFrom(pairs, () => 0.5)[0]?.target).toBe("b");
  expect(drillFrom([], () => 0.5)).toEqual([]);
});

test("the note on voices counts them", () => {
  expect(voicesNote([])).toStartWith("No Norwegian voice is installed");
  expect(voicesNote(["Nora"])).toBe(
    "This device has one Norwegian voice (Nora). Ear training works best with several voices."
  );
  expect(voicesNote(["Nora", "Henrik"])).toBe(
    "This device has 2 Norwegian voices. The drill switches between them."
  );
});
