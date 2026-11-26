// Where every lesson sits on the Map, and the curves that join a lesson to the lessons it needs.
import type { Lesson } from "@norsk/course";

/** Sizes of the graph, in rem so the text size setting scales it. */
export interface MapSizes {
  /** The width kept free for one lesson. */
  slot: number;
  /** The space between two slots. */
  gap: number;
  /** The distance from the top of one row to the top of the next. */
  row: number;
  /** The height of a lesson. */
  node: number;
}

export const MAP_SIZES = {
  desktop: { gap: 1, node: 3.25, row: 8.5, slot: 13.5 },
  phone: { gap: 0.5, node: 2.5, row: 5.75, slot: 9.5 },
} as const satisfies Record<string, MapSizes>;

export interface MapNode {
  lesson: Lesson;
  /** The centre of the lesson's slot, in rem from the left. */
  x: number;
  /** The top of the lesson, in rem. */
  y: number;
}

export interface MapEdge {
  /** The lesson that is needed. */
  from: number;
  /** The lesson that needs it. */
  to: number;
  /** The curve, as the `d` of an SVG path whose units are rem. */
  path: string;
}

export interface MapLayout {
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
}

/**
 * The row of every lesson: one below its deepest need, so needs always point upward.
 * A need that is not among the lessons, such as one from an earlier level, is left out.
 */
const depths = (lessons: readonly Lesson[]): Map<number, number> => {
  const depth = new Map<number, number>();

  // A lesson only needs lessons that come before it, so one pass in order is enough.
  for (const lesson of lessons) {
    const deepest = Math.max(
      -1,
      ...lesson.needs.flatMap((need) => depth.get(need) ?? [])
    );

    depth.set(lesson.index, deepest + 1);
  }

  return depth;
};

const rowWidth = (count: number, { slot, gap }: MapSizes): number =>
  count * slot + (count - 1) * gap;

/** A curve from the bottom of the needed lesson to the top of the lesson that needs it. */
const curve = (from: MapNode, to: MapNode, node: number): string => {
  const start = from.y + node;
  const bend = (to.y - start) / 2;

  return `M${from.x} ${start} C${from.x} ${start + bend}, ${to.x} ${to.y - bend}, ${to.x} ${to.y}`;
};

export const layoutMap = (
  lessons: readonly Lesson[],
  sizes: MapSizes
): MapLayout => {
  const depth = depths(lessons);
  const rowCount = Math.max(0, ...depth.values()) + 1;

  const rows = Array.from({ length: rowCount }, (_, row) =>
    lessons.filter((lesson) => depth.get(lesson.index) === row)
  );

  const width = rowWidth(Math.max(...rows.map((row) => row.length)), sizes);

  const placed = rows.flatMap((row, at) => {
    const left = (width - rowWidth(row.length, sizes)) / 2;

    return row.map((lesson, place) => ({
      lesson,
      x: left + place * (sizes.slot + sizes.gap) + sizes.slot / 2,
      y: at * sizes.row,
    }));
  });

  const byIndex = new Map(placed.map((node) => [node.lesson.index, node]));

  // In the order of the course, which is the order they are drawn and reached by keyboard.
  const nodes = lessons.flatMap((lesson) => byIndex.get(lesson.index) ?? []);

  const edges = nodes.flatMap((to) =>
    to.lesson.needs.flatMap((need) => {
      const from = byIndex.get(need);

      return from === undefined
        ? []
        : [
            {
              from: need,
              path: curve(from, to, sizes.node),
              to: to.lesson.index,
            },
          ];
    })
  );

  return {
    edges,
    height: (rowCount - 1) * sizes.row + sizes.node,
    nodes,
    width,
  };
};
