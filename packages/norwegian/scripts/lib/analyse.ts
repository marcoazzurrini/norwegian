// Matches the words of a Norwegian text to the items that teach them, and finds the grammar patterns it uses.
import type { Token } from "@norsk/course";

import type { Report } from "./draft";
import { FEAT_ORDER } from "./forms";
import type { Feat } from "./forms";
import { filled } from "./text";
import { lessonOfItem } from "./vocabulary";
import type { Candidate, SpelledChunk, Vocabulary } from "./vocabulary";

const MODAL_LEMMAS = new Set(["ville", "kunne", "måtte", "skulle", "burde"]);

const POSSESSIVE_LEMMAS = new Set([
  "min",
  "din",
  "hans",
  "hennes",
  "vår",
  "deres",
]);

const OBJECT_PRONOUNS = new Set(["meg", "deg", "ham", "henne", "oss", "dem"]);

const SUBJECTS = new Set([
  "jeg",
  "du",
  "han",
  "hun",
  "vi",
  "dere",
  "de",
  "det",
  "dette",
]);

const WH = new Set([
  "hva",
  "hvor",
  "hvem",
  "hvordan",
  "når",
  "hvorfor",
  "hvilken",
  "hvilket",
  "hvilke",
]);

const SUB_CONJ = new Set(["at", "fordi", "hvis"]);
const ARTICLES = new Set(["en", "ei", "et"]);
const PERFECT_HELPERS = new Set(["har", "hadde"]);

/** One word of the text being analysed. */
interface Word {
  /** As written, without punctuation. */
  t: string;
  lc: string;
  /** The word class or the meaning the author chose with word{pos} or word{meaning}. */
  pick: string | undefined;
  /** Whether the word ends a sentence. */
  end: boolean;
}

/** A word of the text with the token made for it. */
interface WordToken {
  word: Word;
  token: Token;
}

/** What the analysis found out about one word. */
interface Reading {
  feats: Set<Feat>;
  lemma: string;
  pos: string;
  /** An irregular form taught on its own, such as "gikk". */
  irregular: boolean;
}

const UNREAD: Reading = {
  feats: new Set(),
  irregular: false,
  lemma: "",
  pos: "",
};

/** The text being analysed, and what is known about it so far. */
interface Analysis {
  vocabulary: Vocabulary;
  report: Report;
  text: string;
  where: string;
  glosses: Record<string, string>;
  /** Items taught after this lesson are used only when no earlier one fits. */
  limit: number;
  words: Word[];
  /** One token for each word. */
  tokens: Token[];
  /** One reading for each word. */
  readings: Reading[];
}

/** word{pos} or word{meaning}: the author's choice for a spelling that is two words, or a word with two meanings. */
const PICKED = /^(?<before>.*?)\{(?<pick>\w+)\}(?<after>.*)$/u;
const OUTER_PUNCTUATION = /^[.,!?:;"«»()]+|[.,!?:;"«»()]+$/gu;
const SENTENCE_END = /[.!?:]["»]?$/u;
const QUESTION = /\?\s*$/u;

const wordOf = (written: string): Word => {
  const { before, pick, after } = PICKED.exec(written)?.groups ?? {};
  const full = pick === undefined ? written : `${before ?? ""}${after ?? ""}`;
  const t = full.replaceAll(OUTER_PUNCTUATION, "");

  return { t, lc: t.toLowerCase(), pick, end: SENTENCE_END.test(full) };
};

const splitWords = (text: string): Word[] =>
  text
    .split(/\s+/u)
    .filter((written) => written !== "")
    .map(wordOf)
    .filter((word) => word.t !== "");

/** The lower-cased word at a position, or "" when the text has no word there. */
const wordAt = (a: Analysis, i: number): string => a.words[i]?.lc ?? "";

const readingAt = (a: Analysis, i: number): Reading => a.readings[i] ?? UNREAD;

// ---------------------------------------------------------------- chunks

const partMatches = (part: Set<string>[], a: Analysis, at: number) =>
  part.every((spellings, k) => spellings.has(wordAt(a, at + k)));

/** Positions of the words a chunk covers when it starts at `start`, or null when it does not fit there. */
const chunkCover = (
  chunk: SpelledChunk,
  a: Analysis,
  start: number
): number[] | null => {
  const covered: number[] = [];
  let pos = start;

  for (const [n, part] of chunk.parts.entries()) {
    // A chunk that ends in a slot has an empty last part: nothing more to find.
    if (n > 0 && part.length === 0) {
      continue;
    }

    if (n > 0) {
      // The slot takes at least one word; find where the next part begins.
      pos += 1;

      while (
        pos + part.length <= a.words.length &&
        !partMatches(part, a, pos)
      ) {
        pos += 1;
      }
    }

    if (!partMatches(part, a, pos)) {
      return null;
    }

    for (const k of part.keys()) {
      covered.push(pos + k);
    }

    pos += part.length;
  }

  return covered;
};

/** Marks the tokens that chunks cover. Longest chunk first; each token belongs to at most one chunk. */
const markChunks = (a: Analysis) => {
  for (const chunk of a.vocabulary.chunks) {
    const firstLength = chunk.parts[0]?.length ?? 0;

    for (let i = 0; i + firstLength <= a.words.length; i += 1) {
      const covered = chunkCover(chunk, a, i) ?? [];
      const tokens = covered.flatMap((k) => a.tokens[k] ?? []);

      if (tokens.length > 0 && tokens.every((t) => t.c === undefined)) {
        for (const token of tokens) {
          token.c = chunk.id;
        }
      }
    }
  }
};

// ---------------------------------------------------------------- words

const lemmaKey = (c: Candidate) => c.lemma.toLowerCase();

/** An uninflected word spelled exactly like this (så, for) ranks before an inflected form of another word. */
const rank = (c: Candidate) =>
  c.feats.has("other") && !c.exact
    ? -1
    : FEAT_ORDER.findIndex((f) => c.feats.has(f));

/** The most likely reading first; of two equally likely ones, the one taught first. */
const byRankThenLesson = (x: Candidate, y: Candidate) =>
  rank(x) === rank(y) ? x.lesson - y.lesson : rank(x) - rank(y);

/** The word items the word at this position may be. */
const candidatesAt = (a: Analysis, word: Word, i: number): Candidate[] => {
  const { formIndex, names } = a.vocabulary;
  let candidates = formIndex.get(word.lc) ?? [];

  // A capitalised name wins over a word with the same spelling (Anna / anna).
  if (names.has(word.lc) && /^[A-ZÆØÅ]/u.test(word.t) && i > 0) {
    candidates = [];
  }

  const taught = candidates.filter((c) => c.lesson <= a.limit);

  if (taught.length > 0) {
    candidates = taught;
  }

  // An irregular form taught on its own replaces the general entry of the same verb (gikk / gå).
  const irregular = new Set(candidates.filter((c) => c.exact).map(lemmaKey));

  return candidates.filter((c) => c.exact || !irregular.has(lemmaKey(c)));
};

/**
 * Two different words share this spelling. Inflected readings are ranked (jobber: verb before plural noun);
 * an uninflected one (så, vår) cannot be ranked, so the author must choose.
 */
const warnIfAmbiguous = (
  a: Analysis,
  word: Word,
  token: Token,
  candidates: Candidate[]
) => {
  if (
    new Set(candidates.map(lemmaKey)).size > 1 &&
    candidates.some((c) => c.feats.has("other")) &&
    candidates.some(
      (c) => c.exact && c.text.toLowerCase() !== c.lemma.toLowerCase()
    ) &&
    token.c === undefined
  ) {
    const ids = candidates.map((c) => c.id).join(", ");
    const pos = candidates.at(-1)?.pos ?? "";

    a.report.warnings.push(
      `${a.where}: "${word.t}" is ambiguous (${ids}); write ${word.t}{${pos}} to choose`
    );
  }
};

/**
 * A word taught once for each of its meanings (bli: to become, to stay). Nothing in the text
 * tells the meanings apart, so the author must name the one that is meant; otherwise the
 * sentence would train the wrong item.
 */
const requireMeaning = (
  a: Analysis,
  word: Word,
  best: Candidate,
  candidates: Candidate[]
) => {
  const meanings = candidates.filter(
    (c) => c.sense !== undefined && c.text === best.text && c.pos === best.pos
  );

  if (best.sense !== undefined && meanings.length > 1) {
    const choices = meanings.map((c) => `${word.t}{${c.sense}}`).join(" or ");

    a.report.errors.push(
      `${a.where}: "${word.t}" has ${meanings.length} meanings; write ${choices}`
    );
  }
};

/** Other spellings of the same form (boka / boken). */
const otherSpellings = (best: Candidate, written: string): string[] => {
  const least = FEAT_ORDER.find((f) => best.feats.has(f));

  if (best.exact || least === undefined) {
    return [];
  }

  return [...best.forms].flatMap(([form, feats]) =>
    form !== written &&
    [...best.feats].some((f) => feats.has(f)) &&
    feats.has(least)
      ? [form]
      : []
  );
};

/** Records on the token what a word is when no word item fits: an article, a name, a glossed word. */
const readOtherWord = (a: Analysis, word: Word, token: Token) => {
  if (ARTICLES.has(word.lc)) {
    if (word.lc === "ei") {
      token.alts = ["en"];
    }
  } else if (
    a.vocabulary.names.has(word.lc) ||
    /^\d+$/u.test(word.lc) ||
    filled(a.glosses[word.lc])
  ) {
    token.free = true;
  } else if (token.c === undefined) {
    a.report.errors.push(
      `${a.where}: "${word.t}" is not a taught word, chunk or name`
    );
  }
};

/** Finds the item for the word at this position, and returns what was learned about the word. */
const readWord = (a: Analysis, word: Word, token: Token, i: number) => {
  let candidates = candidatesAt(a, word, i);

  if (word.pick === undefined) {
    warnIfAmbiguous(a, word, token, candidates);
  } else {
    candidates = candidates.filter(
      (c) => c.pos === word.pick || c.sense === word.pick
    );
  }

  const [best] = candidates.toSorted(byRankThenLesson);

  if (best !== undefined) {
    requireMeaning(a, word, best, candidates);
  }

  if (best === undefined) {
    readOtherWord(a, word, token);

    return UNREAD;
  }

  token.w = best.id;

  const alts = otherSpellings(best, word.lc);

  if (alts.length > 0) {
    token.alts = alts;
  }

  return {
    feats: best.feats,
    irregular:
      best.exact && best.lemma.toLowerCase() !== best.text.toLowerCase(),
    lemma: best.lemma,
    pos: best.pos,
  };
};

// ---------------------------------------------------------------- patterns

/** The ids of the names that are patterns of the curriculum. Other names are dropped. */
const patternIds = (a: Analysis, names: Iterable<string>): string[] =>
  [...names].flatMap((name) =>
    a.vocabulary.info.has(`p:${name}`) ? [`p:${name}`] : []
  );

/** A verb that carries tense: the one that takes second place in a sentence. */
const carriesTense = ({ pos, feats, lemma }: Reading) =>
  pos === "verb" &&
  (MODAL_LEMMAS.has(lemma) ||
    ((feats.has("pres") || feats.has("pret")) &&
      !feats.has("inf") &&
      !feats.has("sg")));

const verbPatterns = (a: Analysis, i: number): string[] => {
  const reading = readingAt(a, i);
  const { feats } = reading;
  const found: string[] = [];

  if (MODAL_LEMMAS.has(reading.lemma)) {
    found.push("modal");

    if (reading.lemma === "skulle") {
      found.push("future");
    }
  } else if (feats.has("pres") && !feats.has("inf")) {
    found.push("present");
  }

  const afterHar = [1, 2, 3].some((d) => PERFECT_HELPERS.has(wordAt(a, i - d)));

  // A verb that opens a sentence and is not followed by its subject is an order: Kom! Vent litt!
  const order =
    feats.has("imp") &&
    (i === 0 || a.words[i - 1]?.end === true) &&
    !SUBJECTS.has(wordAt(a, i + 1)) &&
    !QUESTION.test(a.text);

  if (order) {
    found.push("imperative");
  } else if (feats.has("perf") && afterHar) {
    found.push("perfect");
  } else if (
    feats.has("pret") &&
    !feats.has("pres") &&
    !feats.has("inf") &&
    !reading.irregular
  ) {
    found.push("past");
  }

  return found;
};

const nounPatterns = (feats: Set<Feat>): string[] => {
  if (feats.has("sg")) {
    return [];
  }

  if (feats.has("sg-def")) {
    return ["definite"];
  }

  if (feats.has("pl")) {
    return ["plural"];
  }

  return feats.has("pl-def") ? ["plural-def"] : [];
};

/** Names of the patterns the word at this position exercises. */
const wordPatterns = (a: Analysis, token: Token, i: number): string[] => {
  const lc = wordAt(a, i);
  const { pos, feats, lemma } = readingAt(a, i);
  const found: string[] = [];

  if (ARTICLES.has(lc) && token.w === undefined) {
    found.push("gender");
  }

  if (lc === "ikke") {
    found.push("neg");
  }

  if (token.w === "w:å:other") {
    found.push("inf-aa");
  }

  if (pos === "verb") {
    found.push(...verbPatterns(a, i));
  }

  if (pos === "noun") {
    found.push(...nounPatterns(feats));
  }

  if (
    pos === "adj" &&
    !feats.has("base") &&
    (feats.has("neut") || feats.has("e-form"))
  ) {
    found.push("adj-agree");
  }

  if (pos === "det" && POSSESSIVE_LEMMAS.has(lemma)) {
    found.push("possessive");
  }

  if (OBJECT_PRONOUNS.has(lc)) {
    found.push("obj-pron");
  }

  return found;
};

/** Names of the patterns of the text as a whole: the kind of question, and word order. */
const textPatterns = (a: Analysis): Set<string> => {
  const found = new Set<string>();
  const finite = a.readings.map(carriesTense);
  const question = QUESTION.test(a.text);

  if (question && WH.has(wordAt(a, 0))) {
    found.add("q-wh");
  } else if (question && finite[0] === true) {
    found.add("q-yn");
  }

  // A finite verb right before its subject, later than the first word and not right after a word such as "at".
  const inverted = finite.some(
    (finiteVerb, i) =>
      i >= 1 &&
      finiteVerb &&
      SUBJECTS.has(wordAt(a, i + 1)) &&
      !SUB_CONJ.has(wordAt(a, i - 1))
  );

  if (!question && inverted) {
    found.add("v2");
  }

  if (a.words.some((word) => SUB_CONJ.has(word.lc))) {
    found.add("sub");
  }

  return found;
};

// ---------------------------------------------------------------- the whole text

export interface AnalyseOptions {
  text: string;
  /** Where the text is, for messages. */
  where: string;
  /** Patterns the author added. */
  plus?: string[];
  /** Patterns the author removed. */
  minus?: string[];
  /** Words that are explained beside the text instead of taught. */
  glosses?: Record<string, string>;
  /** The last lesson whose items the text may use freely. */
  limit?: number;
}

export interface Analysed {
  tokens: Token[];
  /** Patterns of the text as a whole. */
  patterns: string[];
}

export const analyse = (
  vocabulary: Vocabulary,
  report: Report,
  options: AnalyseOptions
): Analysed => {
  const pairs = splitWords(options.text).map((word): WordToken => ({
    word,
    token: { t: word.t },
  }));

  const a: Analysis = {
    vocabulary,
    report,
    text: options.text,
    where: options.where,
    glosses: options.glosses ?? {},
    limit: options.limit ?? Infinity,
    words: pairs.map((pair) => pair.word),
    tokens: pairs.map((pair) => pair.token),
    readings: [],
  };

  markChunks(a);

  for (const [i, { word, token }] of pairs.entries()) {
    a.readings.push(readWord(a, word, token, i));
  }

  for (const [i, token] of a.tokens.entries()) {
    const kept = patternIds(a, wordPatterns(a, token, i));

    if (kept.length > 0) {
      token.p = kept;
    }
  }

  const patterns = textPatterns(a);

  for (const name of options.plus ?? []) {
    if (!vocabulary.info.has(`p:${name}`)) {
      report.errors.push(`${a.where}: unknown pattern +${name}`);
    }

    patterns.add(name);
  }

  for (const name of options.minus ?? []) {
    patterns.delete(name);

    for (const token of a.tokens) {
      if (token.p !== undefined) {
        token.p = token.p.filter((id) => id !== `p:${name}`);
      }
    }
  }

  return { tokens: a.tokens, patterns: patternIds(a, patterns) };
};

/** The lesson after which every item of this text has been taught. */
export const readyAt = (vocabulary: Vocabulary, analysed: Analysed): number => {
  const lessonOf = (id: string) => lessonOfItem(vocabulary, id);
  let max = 0;
  let allChunk = true;

  for (const token of analysed.tokens) {
    if (token.free === true) {
      continue;
    }

    // A token is ready when its word and its patterns are taught, or when a chunk that covers it is.
    const ids = [
      ...(token.w === undefined ? [] : [token.w]),
      ...(token.p ?? []),
    ];

    const viaWord = ids.length > 0 ? Math.max(...ids.map(lessonOf)) : Infinity;
    const viaChunk = token.c === undefined ? Infinity : lessonOf(token.c);

    if (viaChunk > viaWord || token.c === undefined) {
      allChunk = false;
    }

    max = Math.max(max, Math.min(viaWord, viaChunk));
  }

  // The patterns of the whole text count too, unless chunks cover every word.
  if (!allChunk && analysed.patterns.length > 0) {
    max = Math.max(max, ...analysed.patterns.map(lessonOf));
  }

  return max;
};
