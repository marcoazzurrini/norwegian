import { expect, test } from "bun:test";

import type { Mem } from "@norsk/engine";
import { course } from "@norsk/norwegian";

import { itemGroups, memoryNote, splitAt } from "./item-list";

const { item, levels } = course;

const DAY = 86_400_000;

const levelAt = (index: number) => {
  const found = levels[index];

  if (found === undefined) {
    throw new Error(`No level ${index}`);
  }

  return found;
};

const A1 = levelAt(0);
const A2 = levelAt(1);
const NOW = Date.UTC(2026, 2, 10, 8);

const mem = (stability: number, dueAt: number): Mem => ({
  card: {
    cardId: "c:hei",
    difficulty: 2,
    dueAt: new Date(dueAt),
    lapses: 0,
    lastReviewAt: null,
    learningStep: 0,
    reps: 1,
    scheduleStatus: "review",
    scheduledDays: 1,
    stability,
    state: 2,
  },
  id: "c:hei",
  introducedAt: NOW,
});

test("without a search every unit is listed with all its items", () => {
  const groups = itemGroups(course, "  ", A1);

  expect(groups[0]?.unit.index).toBe(1);
  expect(groups[0]?.list[0]?.id).toBe("c:hei");
});

test("a search matches the Norwegian or the English, in any case", () => {
  const found = itemGroups(course, " TAKK ", A1).flatMap((group) => group.list);

  expect(found.map((one) => one.id)).toContain("w:takk:interj");
  expect(found.every((one) => /takk/iu.test(`${one.text} ${one.gloss}`))).toBe(
    true
  );
  expect(itemGroups(course, "thanks", A1).length).toBeGreaterThan(0);
  expect(itemGroups(course, "zzzz", A1)).toEqual([]);
});

test("a list is cut after the chosen item", () => {
  const list = [item("c:hei"), item("c:ha-det-bra"), item("w:takk:interj")];
  const cut = splitAt(list, "c:ha-det-bra");

  expect(cut?.before.map((one) => one.id)).toEqual(["c:hei", "c:ha-det-bra"]);
  expect(cut?.chosen.id).toBe("c:ha-det-bra");
  expect(cut?.after.map((one) => one.id)).toEqual(["w:takk:interj"]);
  expect(splitAt(list, null)).toBeNull();
  expect(splitAt(list, "w:ja:interj")).toBeNull();
});

test("the note on a memory says how long it lasts and when it comes back", () => {
  expect(memoryNote(mem(0.4, NOW - DAY), NOW)).toEqual({
    lasts: "less than a day",
    next: "now",
  });
  expect(memoryNote(mem(12.4, NOW + DAY), NOW).lasts).toBe("12 days");
  expect(memoryNote(mem(12.4, NOW + DAY), NOW).next).not.toBe("now");
});

test("only the units of the chosen level are listed", () => {
  const groups = itemGroups(course, "", A1);

  expect(groups.length).toBeGreaterThan(0);
  expect(groups.every((group) => group.unit.level === "A1")).toBe(true);
  // A2 is not written yet, so it has nothing to list.
  expect(itemGroups(course, "", A2)).toEqual([]);
});
