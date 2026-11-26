// Turns the sentences and stories of the draft into their final form, with every word matched to an item.
import type { Sentence, Story } from "@norsk/course";

import { analyse, readyAt } from "./analyse";
import type { Analysed } from "./analyse";
import type { Draft, Practice, RawSentence, RawStory, Report } from "./draft";
import { filled, norm, slug } from "./text";
import { lessonOfItem } from "./vocabulary";
import type { Vocabulary } from "./vocabulary";

/** word{pos} marks the author's choice of word class. It is not part of the text shown. */
const withoutPicks = (text: string) => text.replaceAll(/\{\w+\}/gu, "");

/** The last lesson of a unit. */
const unitEnd = (draft: Draft, unit: number): number => {
  const found = draft.units.find((u) => u.index === unit);

  if (found === undefined) {
    throw new Error(`Unknown unit ${unit}`);
  }

  return Math.max(...found.lessons);
};

/** Ids of the items a text exercises, each once: words, patterns and, when asked for, chunks. */
const itemsUsed = (analysed: Analysed, withChunks: boolean): Set<string> => {
  const ids = analysed.tokens.flatMap((token) => [
    token.w,
    withChunks ? token.c : undefined,
    ...(token.p ?? []),
  ]);

  return new Set([...ids, ...analysed.patterns].filter(filled));
};

const buildSentences = (
  draft: Draft,
  vocabulary: Vocabulary,
  report: Report
): Pick<Practice, "sentences" | "usage"> => {
  const sentences: Sentence[] = [];
  const seen = new Set<string>();
  const usage = new Map<string, number>();

  const addSentence = (raw: RawSentence) => {
    const end = unitEnd(draft, raw.unit);

    const analysed = analyse(vocabulary, report, {
      text: raw.target,
      where: raw.where,
      plus: raw.plus,
      minus: raw.minus,
      limit: end,
    });

    const key = norm(raw.target);

    if (seen.has(key)) {
      report.warnings.push(`${raw.where}: duplicate sentence`);

      return;
    }

    seen.add(key);

    if (readyAt(vocabulary, analysed) > end) {
      const late = [...itemsUsed(analysed, false)].filter(
        (id) => lessonOfItem(vocabulary, id) > end
      );

      report.errors.push(
        `${raw.where}: uses items taught after unit ${raw.unit}: ${late.join(", ")}`
      );

      return;
    }

    for (const id of itemsUsed(analysed, true)) {
      usage.set(id, (usage.get(id) ?? 0) + 1);
    }

    sentences.push({
      id: `s${raw.unit}-${slug(raw.target).slice(0, 40)}`,
      unit: raw.unit,
      target: withoutPicks(raw.target),
      base: raw.base,
      tokens: analysed.tokens,
      patterns: analysed.patterns,
      alts: raw.alts,
    });
  };

  for (const raw of draft.rawSentences) {
    addSentence(raw);
  }

  return { sentences, usage };
};

const buildStory = (
  draft: Draft,
  vocabulary: Vocabulary,
  report: Report,
  raw: RawStory,
  position: number
): Story => {
  const end = unitEnd(draft, raw.unit);

  const lines = raw.lines.map((line) => {
    const analysed = analyse(vocabulary, report, {
      text: line.target,
      where: `${raw.where} "${line.target}"`,
      glosses: raw.glosses,
      limit: end,
    });

    if (readyAt(vocabulary, analysed) > end) {
      report.errors.push(
        `${raw.where}: line "${line.target}" uses items taught after unit ${raw.unit}`
      );
    }

    return {
      who: line.who,
      target: withoutPicks(line.target),
      base: line.base,
      tokens: analysed.tokens,
    };
  });

  const words = lines.flatMap((line) => line.tokens);

  const unknown = new Set(
    words
      .map((token) => token.t.toLowerCase())
      .filter((word) => filled(raw.glosses[word]))
  ).size;

  if (words.length > 0 && unknown / words.length > 0.05) {
    report.warnings.push(
      `${raw.where}: ${Math.round((unknown / words.length) * 100)}% of the words are new (limit 5%)`
    );
  }

  if (raw.questions.length < 2) {
    report.warnings.push(`${raw.where}: story has fewer than 2 questions`);
  }

  return {
    id: `st${raw.unit}-${position}`,
    unit: raw.unit,
    title: raw.title,
    titleBase: raw.titleBase,
    lines,
    questions: raw.questions,
    glosses: raw.glosses,
  };
};

export const buildPractice = (
  draft: Draft,
  vocabulary: Vocabulary,
  report: Report
): Practice => {
  const { sentences, usage } = buildSentences(draft, vocabulary, report);

  const stories = draft.rawStories.map((raw, position) =>
    buildStory(draft, vocabulary, report, raw, position)
  );

  return { sentences, stories, usage };
};
