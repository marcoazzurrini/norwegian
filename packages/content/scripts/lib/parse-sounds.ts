// Reads text/sounds.txt: pairs of words that differ in one sound, in groups. The format is at the top of that file.
import { readFileSync } from "node:fs";

import type { SoundPair } from "../../src/schema";
import type { Report } from "./draft";
import { fields } from "./text";

interface Group {
  title: string;
  hint: string;
}

export const parseSounds = (file: string, report: Report): SoundPair[] => {
  const sounds: SoundPair[] = [];
  const groups = new Map<string, Group>();

  const addGroup = (line: string) => {
    const [id = "", title, hint] = fields(line.slice(6));

    if (title === undefined || hint === undefined) {
      report.errors.push(`sounds.txt: group ${id} needs a title and a hint`);

      return;
    }

    groups.set(id, { title, hint });
  };

  const addPair = (line: string) => {
    const [group = "", a, aGloss, b, bGloss] = fields(line.slice(5));
    const known = groups.get(group);

    if (known === undefined) {
      report.errors.push(`sounds.txt: unknown group ${group}`);

      return;
    }

    if (
      a === undefined ||
      aGloss === undefined ||
      b === undefined ||
      bGloss === undefined
    ) {
      report.errors.push(
        `sounds.txt: a pair of group ${group} needs two words, each with its meaning`
      );

      return;
    }

    sounds.push({
      id: `${group}:${a}-${b}`,
      group,
      groupTitle: known.title,
      hint: known.hint,
      a: { word: a, gloss: aGloss },
      b: { word: b, gloss: bGloss },
    });
  };

  for (const line of readFileSync(file, "utf-8").split("\n")) {
    if (line.startsWith("group ")) {
      addGroup(line);
    } else if (line.startsWith("pair ")) {
      addPair(line);
    }
  }

  return sounds;
};
