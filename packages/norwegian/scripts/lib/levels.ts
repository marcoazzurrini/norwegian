// Reads text/levels.txt, and puts every unit into the level it names.
import { readFileSync } from "node:fs";

import type { Level, Unit } from "@norsk/course";

import type { Report } from "./draft";
import { fields, listOf } from "./text";

/** The levels as listed in the file, each still without units. */
const readLevels = (file: string, report: Report): Level[] =>
  listOf(readFileSync(file, "utf-8"), "\n")
    .filter((line) => !line.startsWith("#"))
    .map((line) => {
      const [id = "", name] = fields(line);

      if (id === "" || name === undefined || name === "") {
        report.errors.push(`levels.txt: "${line}" needs an id and a name`);
      }

      return { id, name: name ?? "", units: [] };
    });

/**
 * The levels of the course with their units. A unit of an unknown level is an error, and so is
 * a unit of an earlier level after a unit of a later one: the course is learned in one order.
 */
export const parseLevels = (
  file: string,
  units: readonly Unit[],
  report: Report
): Level[] => {
  const levels = readLevels(file, report);
  let reached = 0;

  for (const unit of units) {
    const at = levels.findIndex((level) => level.id === unit.level);
    const level = levels[at];

    if (level === undefined) {
      report.errors.push(
        `unit ${unit.index}: level "${unit.level}" is not in levels.txt`
      );
    } else if (at < reached) {
      report.errors.push(
        `unit ${unit.index}: level ${unit.level} comes after a unit of a later level`
      );
    } else {
      reached = at;
      level.units.push(unit.index);
    }
  }

  return levels;
};
