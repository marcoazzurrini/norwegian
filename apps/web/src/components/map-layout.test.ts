import { expect, test } from "bun:test";

import { lessons } from "@norsk/content";
import type { Lesson } from "@norsk/content";

import { MAP_SIZES, layoutMap } from "./map-layout";

const lesson = (index: number, needs: number[]): Lesson => ({
  index,
  items: [],
  needs,
  title: `Lesson ${index}`,
  unit: 1,
});

const SIZES = { gap: 1, node: 2, row: 10, slot: 8 };

test("a lesson sits one row below its deepest need", () => {
  const { nodes, height } = layoutMap(
    [lesson(0, []), lesson(1, [0]), lesson(2, [0]), lesson(3, [1, 0])],
    SIZES
  );

  expect(nodes.map((node) => [node.lesson.index, node.y])).toEqual([
    [0, 0],
    [1, 10],
    [2, 10],
    [3, 20],
  ]);
  expect(height).toBe(22);
});

test("each row is centred in the widest row", () => {
  const { nodes, width } = layoutMap(
    [lesson(0, []), lesson(1, [0]), lesson(2, [0])],
    SIZES
  );

  // Two slots of 8 and a gap of 1.
  expect(width).toBe(17);
  expect(nodes.map((node) => node.x)).toEqual([8.5, 4, 13]);
});

test("a curve runs from the bottom of the need to the top of the lesson", () => {
  const { edges } = layoutMap([lesson(0, []), lesson(1, [0])], SIZES);

  expect(edges).toEqual([{ from: 0, path: "M4 2 C4 6, 4 6, 4 10", to: 1 }]);
});

test("the real curriculum fits: every lesson has a place and every need a curve", () => {
  const { nodes, edges } = layoutMap(lessons, MAP_SIZES.desktop);

  expect(nodes).toHaveLength(lessons.length);
  expect(edges).toHaveLength(
    lessons.reduce((count, one) => count + one.needs.length, 0)
  );
});
