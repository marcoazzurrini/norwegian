// Reads the unit files in text/units into a draft. The file format is described in text/README.md.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import * as v from "valibot";

import { GenderSchema } from "../../src/schema";
import type {
  Example,
  Gender,
  Item,
  Lesson,
  Quiz,
  Unit,
} from "../../src/schema";
import type { Draft, ItemInfo, RawSentence, RawStory, Report } from "./draft";
import { formTable, lemmaForms } from "./forms";
import type { Feat, Forms } from "./forms";
import type { Lexicon } from "./sources";
import { fields, filled, listOf, norm, slug } from "./text";

/** One line of a unit file, and where it is, for messages. */
interface Line {
  text: string;
  where: string;
}

/** The parts of the pattern being read that later lines add to. */
interface OpenPattern {
  rule: string[];
  examples: Example[];
  quiz: Quiz[];
}

/** The state of reading one unit file. */
interface Reader {
  draft: Draft;
  lexicon: Lexicon;
  report: Report;
  unit: Unit | null;
  lesson: Lesson | null;
  mode: "lesson" | "sentences" | "story" | null;
  /** The last pattern of the lesson: "rule:", "ex:" and "q:" lines belong to it. */
  pattern: OpenPattern | null;
  story: RawStory | null;
}

/** The pronunciation lexicon's tag for a word class of the unit files. */
const UTTALE_POS = new Map([
  ["noun", "NN"],
  ["verb", "VB"],
  ["adj", "JJ"],
  ["adv", "AB"],
  ["pron", "PN"],
  ["prep", "PP"],
  ["conj", "KN"],
  ["det", "DT"],
  ["num", "RG"],
  ["interj", "IN"],
]);

/** Word classes that Norsk Ordbank is not expected to list. */
const NOT_IN_ORDBANK = new Set(["interj", "other", "adv"]);

const addItem = (reader: Reader, lesson: Lesson, info: ItemInfo, at: Line) => {
  const { id } = info.item;

  if (reader.draft.info.has(id)) {
    reader.report.errors.push(`${at.where}: duplicate item ${id}`);
  }

  reader.draft.info.set(id, info);
  lesson.items.push(id);
};

/** The meaning named on an item line with "sense=", if any. */
const senseOf = (opts: string[]): string | undefined =>
  opts.find((o) => o.startsWith("sense="))?.slice(6);

/**
 * The id of an item that may be one of several meanings of the same text. The meaning written
 * first keeps the plain id, so what a learner already knows of the item stays theirs; each
 * later meaning adds its name.
 */
const idWithSense = (reader: Reader, id: string, sense: string | undefined) =>
  sense !== undefined && reader.draft.info.has(id) ? `${id}:${sense}` : id;

const startUnit = (reader: Reader, line: Line) => {
  const [head = "", name, subtitle] = fields(line.text.slice(2));

  if (name === undefined || subtitle === undefined) {
    reader.report.errors.push(
      `${line.where}: unit needs a name and a subtitle`
    );
  }

  const unit: Unit = {
    index: Number(head.replace("unit", "")),
    name: name ?? "",
    subtitle: subtitle ?? "",
    lessons: [],
  };

  reader.draft.units.push(unit);
  reader.unit = unit;
};

const startLesson = (reader: Reader, line: Line, unit: Unit) => {
  const { draft } = reader;
  const [title = "", needs] = fields(line.text.slice("## lesson".length));

  const lesson: Lesson = {
    index: draft.lessons.length,
    unit: unit.index,
    title,
    items: [],
    needs: [],
  };

  draft.lessons.push(lesson);
  draft.lessonNeeds.push(
    needs?.startsWith("needs:") === true ? listOf(needs.slice(6), ",") : []
  );
  unit.lessons.push(lesson.index);
  reader.lesson = lesson;
  reader.mode = "lesson";
  reader.pattern = null;
};

const startStory = (reader: Reader, line: Line, unit: Unit) => {
  const [title = "", titleEn] = fields(line.text.slice("## story".length));

  if (titleEn === undefined) {
    reader.report.errors.push(
      `${line.where}: story needs a Norwegian and an English title`
    );
  }

  const story: RawStory = {
    unit: unit.index,
    title,
    titleEn: titleEn ?? "",
    lines: [],
    questions: [],
    glosses: {},
    where: line.where,
  };

  reader.draft.rawStories.push(story);
  reader.story = story;
  reader.mode = "story";
};

/** Reads a field of a sentence line that is not "alt:": tags such as "+v2 -past". */
const readTags = (field: string, sentence: RawSentence, report: Report) => {
  for (const tag of field.split(/\s+/u)) {
    if (tag.startsWith("+")) {
      sentence.plus.push(tag.slice(1));
    } else if (tag.startsWith("-")) {
      sentence.minus.push(tag.slice(1));
    } else if (tag !== "") {
      report.errors.push(`${sentence.where}: unknown sentence field "${tag}"`);
    }
  }
};

const readSentence = (reader: Reader, line: Line, unit: Unit) => {
  const { errors } = reader.report;

  if (!line.text.startsWith("s ")) {
    errors.push(`${line.where}: expected a sentence line starting with "s "`);

    return;
  }

  const [no, en, ...rest] = fields(line.text.slice(2));

  if (!filled(no) || !filled(en)) {
    errors.push(`${line.where}: sentence needs Norwegian and English`);

    return;
  }

  const sentence: RawSentence = {
    unit: unit.index,
    no,
    en,
    plus: [],
    minus: [],
    alts: [],
    where: line.where,
  };

  for (const field of rest) {
    if (field.startsWith("alt:")) {
      sentence.alts.push(...listOf(field.slice(4), ";"));
    } else {
      readTags(field, sentence, reader.report);
    }
  }

  reader.draft.rawSentences.push(sentence);
};

/** A quiz line as written: "prompt | *right | wrong | wrong". */
const quizFields = (text: string) => {
  const [prompt = "", ...options] = fields(text);

  return {
    correct: options.find((o) => o.startsWith("*")),
    options,
    prompt,
  };
};

/** The quiz as the app wants it: the correct option first, without its star. */
const quizOf = (prompt: string, options: string[], correct: string): Quiz => ({
  prompt,
  options: [correct.slice(1), ...options.filter((o) => o !== correct)],
});

const readStoryQuestion = (reader: Reader, line: Line, story: RawStory) => {
  const { prompt, options, correct } = quizFields(line.text.slice(1));

  if (correct === undefined || options.length < 2) {
    reader.report.errors.push(
      `${line.where}: question needs options, one marked with *`
    );

    return;
  }

  story.questions.push(quizOf(prompt, options, correct));
};

const readStoryGloss = (reader: Reader, line: Line, story: RawStory) => {
  const [word = "", gloss] = fields(line.text.slice(1));

  if (gloss === undefined) {
    reader.report.errors.push(
      `${line.where}: a new word needs its meaning after a |`
    );

    return;
  }

  story.glosses[word.toLowerCase()] = gloss;
};

/** A spoken line may start with the speaker's name: "Ida: Hei! | Hi!". */
const SPEAKER = /^(?<who>[^:|]{1,12}):\s*(?<said>.*)$/u;

const readStorySpeech = (reader: Reader, line: Line, story: RawStory) => {
  const { who, said } = SPEAKER.exec(line.text)?.groups ?? {};
  const [no, en] = fields(said ?? line.text);

  if (!filled(no) || !filled(en)) {
    reader.report.errors.push(
      `${line.where}: story line needs Norwegian and English`
    );

    return;
  }

  story.lines.push({ who: who ?? "", no, en });
};

const readStoryLine = (reader: Reader, line: Line, story: RawStory) => {
  if (line.text.startsWith("?")) {
    readStoryQuestion(reader, line, story);
  } else if (line.text.startsWith("+")) {
    readStoryGloss(reader, line, story);
  } else {
    readStorySpeech(reader, line, story);
  }
};

const readRule = (pattern: OpenPattern, line: Line) => {
  pattern.rule.push(line.text.slice(5).trim());
};

const readExample = (reader: Reader, pattern: OpenPattern, line: Line) => {
  const [no = "", en] = fields(line.text.slice(3));

  if (en === undefined) {
    reader.report.errors.push(
      `${line.where}: example needs Norwegian and English`
    );

    return;
  }

  pattern.examples.push({ no, en });
};

const readPatternQuiz = (reader: Reader, pattern: OpenPattern, line: Line) => {
  const { prompt, options, correct } = quizFields(line.text.slice(2));

  if (correct === undefined) {
    reader.report.errors.push(
      `${line.where}: quiz needs one option marked with *`
    );

    return;
  }

  pattern.quiz.push(quizOf(prompt, options, correct));
};

const readPattern = (
  reader: Reader,
  line: Line,
  lesson: Lesson,
  body: string[]
) => {
  const [id = "", title, needs = ""] = body;

  if (title === undefined) {
    reader.report.errors.push(`${line.where}: pattern needs an id and a title`);

    return;
  }

  const open: OpenPattern = { rule: [], examples: [], quiz: [] };

  const item: Item = {
    id: `p:${id}`,
    kind: "pattern",
    lesson: lesson.index,
    text: title,
    display: title,
    gloss: title,
    answers: [],
    title,
    // The same lists as in `open`, so that the lines after this one add to the item.
    rule: open.rule,
    examples: open.examples,
    quiz: open.quiz,
    needs: listOf(needs.replace("needs:", ""), ",").map((x) => `p:${x}`),
  };

  addItem(
    reader,
    lesson,
    { item, forms: new Map(), exact: true, lemma: "", sense: undefined },
    line
  );
  reader.pattern = open;
};

const readChunk = (
  reader: Reader,
  line: Line,
  lesson: Lesson,
  body: string[]
) => {
  const [text, gloss, ...opts] = body;

  if (!filled(text) || !filled(gloss)) {
    reader.report.errors.push(`${line.where}: chunk needs text and meaning`);

    return;
  }

  const sense = senseOf(opts);

  const item: Item = {
    id: idWithSense(reader, `c:${slug(text)}`, sense),
    kind: "chunk",
    lesson: lesson.index,
    text,
    display: text,
    gloss,
    answers: [norm(text.replaceAll("___", ""))],
  };

  addItem(
    reader,
    lesson,
    { item, forms: new Map(), exact: true, lemma: "", sense },
    line
  );
};

/** The gender written after the word class, if any. */
const readGender = (
  reader: Reader,
  line: Line,
  written: string | undefined
): Gender | undefined => {
  if (written === undefined || v.is(GenderSchema, written)) {
    return written;
  }

  reader.report.errors.push(`${line.where}: unknown gender "${written}"`);

  return undefined;
};

/** A word as written in a unit file. */
interface WordLine {
  text: string;
  pos: string;
  gender: Gender | undefined;
  gloss: string;
  lemma: string;
  /** Only this spelling counts: an "f" line, a word marked "only", or a pronoun. */
  exact: boolean;
  /** An "f" line: one irregular form, taught as its own item. */
  single: boolean;
}

/** The spellings that count as this word, given the forms Ordbank has for its lemma (null when it has none). */
const wordForms = (
  reader: Reader,
  line: Line,
  word: WordLine,
  all: Forms | null
): Forms => {
  const { warnings } = reader.report;
  const spelling = word.text.toLowerCase();

  if (
    all === null &&
    !NOT_IN_ORDBANK.has(word.pos) &&
    word.gender !== "pl" &&
    !word.exact
  ) {
    warnings.push(
      `${line.where}: "${word.lemma}" (${word.pos}) is not in Norsk Ordbank`
    );
  }

  const other = new Set<Feat>(["other"]);

  if (!word.exact) {
    return all ?? new Map([[spelling, other]]);
  }

  const own = all?.get(spelling);

  if (own === undefined && all !== null) {
    warnings.push(
      `${line.where}: "${word.text}" is not a form of "${word.lemma}"`
    );
  }

  // A word marked "only" is taught as a fixed word (penger, mange); an "f" form keeps its grammar (bøker is a plural).
  return new Map([[spelling, word.single && own !== undefined ? own : other]]);
};

interface Shown {
  display: string;
  answers: string[];
}

/** How a word is shown, and what may be typed for it: a noun with its article, a verb with "å". */
const wordAnswers = (word: WordLine): Shown => {
  const { text, pos, gender, exact } = word;

  if (pos === "noun" && !exact && gender !== undefined && gender !== "pl") {
    return {
      display: `${gender} ${text}`,
      answers:
        gender === "ei" ? [`ei ${text}`, `en ${text}`] : [`${gender} ${text}`],
    };
  }

  if (pos === "verb" && !exact) {
    return { display: `å ${text}`, answers: [text, `å ${text}`] };
  }

  return { display: text, answers: [text.toLowerCase()] };
};

const readWord = (
  reader: Reader,
  line: Line,
  lesson: Lesson,
  kind: "w" | "f",
  body: string[]
) => {
  const { lexicon, report } = reader;
  const [text, posField, gloss, ...opts] = body;

  if (!filled(text) || !filled(posField) || !filled(gloss)) {
    report.errors.push(`${line.where}: word needs text, class and meaning`);

    return;
  }

  const [pos = "", genderField] = posField.split(/\s+/u);

  const word: WordLine = {
    text,
    pos,
    gender: readGender(reader, line, genderField),
    gloss,
    lemma: opts.find((o) => o.startsWith("lemma="))?.slice(6) ?? text,
    // Pronouns are taught form by form (jeg and meg are separate items).
    exact: kind === "f" || opts.includes("only") || pos === "pron",
    single: kind === "f",
  };

  const all = lemmaForms(lexicon, word.lemma, pos, word.gender);
  const forms = wordForms(reader, line, word, all);
  const spelling = text.toLowerCase();

  const spoken =
    lexicon.pronunciation.get(`${spelling}|${UTTALE_POS.get(pos) ?? ""}`) ??
    lexicon.pronunciation.get(spelling);

  if (spoken === undefined) {
    report.warnings.push(`${line.where}: no pronunciation for "${text}"`);
  }

  const { display, answers } = wordAnswers(word);
  const sense = senseOf(opts);

  const item: Item = {
    id: idWithSense(reader, `w:${spelling}:${pos}`, sense),
    kind: "word",
    lesson: lesson.index,
    text,
    display,
    gloss,
    answers,
    pos,
  };

  // The optional parts are added in the order the curriculum file has always had them.
  if (word.gender !== undefined) {
    item.gender = word.gender;
  }

  if (spoken !== undefined) {
    item.ipa = spoken.ipa;
  }

  if (spoken !== undefined && spoken.tone !== null) {
    item.tone = spoken.tone;
  }

  if (!word.exact && all !== null) {
    item.forms = formTable(lexicon, pos, word.gender, all);
  }

  addItem(
    reader,
    lesson,
    { item, forms, exact: word.exact, lemma: word.lemma, sense },
    line
  );
};

/** Reads a line of a lesson: an item, or a detail of the pattern above it. */
const readLessonLine = (reader: Reader, line: Line, lesson: Lesson) => {
  const [kind = ""] = line.text.split(" ");
  const body = fields(line.text.slice(kind.length));
  const { pattern } = reader;

  if (kind === "rule:" && pattern !== null) {
    readRule(pattern, line);
  } else if (kind === "ex:" && pattern !== null) {
    readExample(reader, pattern, line);
  } else if (kind === "q:" && pattern !== null) {
    readPatternQuiz(reader, pattern, line);
  } else if (kind === "p") {
    readPattern(reader, line, lesson, body);
  } else if (kind === "c") {
    readChunk(reader, line, lesson, body);
  } else if (kind === "w" || kind === "f") {
    readWord(reader, line, lesson, kind, body);
  } else {
    reader.report.errors.push(`${line.where}: cannot read line "${line.text}"`);
  }
};

/** Reads a line that is not a heading, according to the section it is in. */
const readSectionLine = (reader: Reader, line: Line, unit: Unit) => {
  const { mode, story, lesson } = reader;

  if (mode === "sentences") {
    readSentence(reader, line, unit);
  } else if (mode === "story" && story !== null) {
    readStoryLine(reader, line, story);
  } else if (mode === "lesson" && lesson !== null) {
    readLessonLine(reader, line, lesson);
  }
};

const readLine = (reader: Reader, line: Line) => {
  if (line.text.startsWith("# unit")) {
    startUnit(reader, line);

    return;
  }

  const { unit } = reader;

  // Nothing counts before the unit heading.
  if (unit === null) {
    return;
  }

  if (line.text.startsWith("## lesson")) {
    startLesson(reader, line, unit);
  } else if (line.text.startsWith("## sentences")) {
    reader.mode = "sentences";
  } else if (line.text.startsWith("## story")) {
    startStory(reader, line, unit);
  } else if (!line.text.startsWith("#")) {
    // Any other line that starts with # is a comment.
    readSectionLine(reader, line, unit);
  }
};

const readUnitFile = (
  file: string,
  draft: Draft,
  lexicon: Lexicon,
  report: Report
) => {
  const reader: Reader = {
    draft,
    lexicon,
    report,
    unit: null,
    lesson: null,
    mode: null,
    pattern: null,
    story: null,
  };

  const lines = readFileSync(file, "utf-8").split("\n");

  for (const [n, raw] of lines.entries()) {
    const text = raw.trim();

    if (text !== "") {
      readLine(reader, { text, where: `${path.basename(file)}:${n + 1}` });
    }
  }
};

/** Reads every unit file in the folder, in the order of their names. */
export const parseUnits = (
  dir: string,
  lexicon: Lexicon,
  report: Report
): Draft => {
  const draft: Draft = {
    units: [],
    lessons: [],
    lessonNeeds: [],
    info: new Map(),
    rawSentences: [],
    rawStories: [],
  };

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .toSorted();

  for (const name of files) {
    readUnitFile(path.join(dir, name), draft, lexicon, report);
  }

  return draft;
};
