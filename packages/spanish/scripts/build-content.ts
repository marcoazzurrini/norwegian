// Builds src/curriculum.json from the files in text/.
// Run: bun scripts/build-content.ts            (build and check everything)
//      bun scripts/build-content.ts --unit 3   (also print a report for unit 3)
//      bun scripts/build-content.ts --force    (write the file even when the text has errors)
// The file format is described in text/README.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { CurriculumSchema } from "@norsk/course";
import type { Curriculum, Item } from "@norsk/course";
import * as v from "valibot";

import type { Draft, Practice, Report } from "./lib/draft";
import { chooseExamples } from "./lib/examples";
import { resolveLessonNeeds } from "./lib/lesson-needs";
import { parseLevels } from "./lib/levels";
import { parseSounds } from "./lib/parse-sounds";
import { parseUnits } from "./lib/parse-units";
import { buildPractice } from "./lib/practice";
import { loadLexicon } from "./lib/sources";
import { listOf } from "./lib/text";
import { vocabularyOf } from "./lib/vocabulary";

const ROOT = path.join(import.meta.dir, "..");

/** The unit that teaches an item. */
const unitOf = (draft: Draft, item: Item): number => {
  const lesson = draft.lessons[item.lesson];

  if (lesson === undefined) {
    throw new Error(
      `Item ${item.id} is in lesson ${item.lesson}, which does not exist`
    );
  }

  return lesson.unit;
};

/** Prints how much practice a unit has, and which of its items are used in too few sentences. */
const printUnitReport = (draft: Draft, practice: Practice, unit: number) => {
  const sentences = practice.sentences.filter((s) => s.unit === unit).length;
  const stories = practice.stories.filter((s) => s.unit === unit).length;

  console.log(`\nUnit ${unit}: ${sentences} sentences, ${stories} stories`);

  const thin = [...draft.info.values()].flatMap(({ item }) => {
    const used = practice.usage.get(item.id) ?? 0;

    return unitOf(draft, item) === unit && used < 3
      ? [`${item.id} (${used})`]
      : [];
  });

  if (thin.length > 0) {
    console.log(
      `Items of this unit used in fewer than 3 sentences:\n  ${thin.join("\n  ")}`
    );
  }
};

/** Writes, for each unit, the list of everything taught up to its end. Authors write sentences from these lists. */
const writeVocabLists = (draft: Draft) => {
  mkdirSync(path.join(ROOT, "data/build"), { recursive: true });

  const rows = [...draft.info.values()].map(({ item, forms, exact }) => {
    const all =
      item.kind === "word" && !exact
        ? ` | forms: ${[...forms.keys()].join(", ")}`
        : "";

    const unit = unitOf(draft, item);

    return {
      line: `${unit}\t${item.id}\t${item.display}\t${item.gloss}${all}`,
      unit,
    };
  });

  for (const unit of draft.units) {
    const lines = rows.flatMap((row) =>
      row.unit <= unit.index ? [row.line] : []
    );

    writeFileSync(
      path.join(
        ROOT,
        `data/build/vocab-u${String(unit.index).padStart(2, "0")}.tsv`
      ),
      `${lines.join("\n")}\n`
    );
  }
};

const printSummary = (curriculum: Curriculum, report: Report) => {
  for (const warning of report.warnings) {
    console.log(`warning: ${warning}`);
  }

  for (const error of report.errors) {
    console.log(`ERROR: ${error}`);
  }

  const counts = { chunk: 0, pattern: 0, word: 0 };

  for (const item of Object.values(curriculum.items)) {
    counts[item.kind] += 1;
  }

  console.log(
    `\n${curriculum.levels.length} levels, ${curriculum.units.length} units, ${curriculum.lessons.length} lessons, ${counts.word} words, ${counts.chunk} chunks, ${counts.pattern} patterns, ${curriculum.sentences.length} sentences, ${curriculum.stories.length} stories, ${curriculum.sounds.length} sound pairs`
  );
  console.log(
    `${report.errors.length} errors, ${report.warnings.length} warnings`
  );
};

/** Ways in which the curriculum does not fit the schema, as lines to print. Empty when it fits. */
const schemaProblems = (curriculum: Curriculum): string[] => {
  const checked = v.safeParse(CurriculumSchema, curriculum);

  return (checked.issues ?? []).map(
    (issue) => `${v.getDotPath(issue) ?? "curriculum"}: ${issue.message}`
  );
};

const report: Report = { errors: [], warnings: [] };
const lexicon = loadLexicon(report);
const draft = parseUnits(path.join(ROOT, "text/units"), lexicon, report);

const names = new Set(
  listOf(readFileSync(path.join(ROOT, "text/names.txt"), "utf-8"), "\n").map(
    (name) => name.toLowerCase()
  )
);

const vocabulary = vocabularyOf(draft, names, lexicon);

resolveLessonNeeds(draft, vocabulary, report);

const practice = buildPractice(draft, vocabulary, report);

chooseExamples(draft, practice.sentences, report);

const curriculum: Curriculum = {
  levels: parseLevels(path.join(ROOT, "text/levels.txt"), draft.units, report),
  units: draft.units,
  lessons: draft.lessons,
  items: Object.fromEntries(
    [...draft.info].map(([id, { item }]) => [id, item])
  ),
  sentences: practice.sentences,
  stories: practice.stories,
  sounds: parseSounds(path.join(ROOT, "text/sounds.txt"), report),
};

if (process.argv.includes("--unit")) {
  const unit = Number(process.argv[process.argv.indexOf("--unit") + 1]);

  printUnitReport(draft, practice, unit);
}

writeVocabLists(draft);

printSummary(curriculum, report);

if (report.errors.length > 0 && !process.argv.includes("--force")) {
  process.exit(1);
}

// The last check, and one that --force does not skip: the app trusts this file without checking it again.
const problems = schemaProblems(curriculum);

if (problems.length > 0) {
  console.log(
    `The curriculum does not fit the schema of @norsk/course:\n  ${problems.slice(0, 20).join("\n  ")}`
  );
  console.log(`${problems.length} schema problems. Nothing was written.`);
  process.exit(1);
}

// The curriculum is written as built, not as the schema returns it: the schema would put the keys in its own order.
writeFileSync(
  path.join(ROOT, "src/curriculum.json"),
  JSON.stringify(curriculum)
);

console.log("wrote src/curriculum.json");
