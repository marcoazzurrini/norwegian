// Matches the words of a Spanish text to the items that teach them, and finds the grammar patterns it uses.
import type { Token } from "@norsk/course";

import type { Report } from "./draft";
import { FEAT_ORDER, isFinite } from "./forms";
import type { Feat } from "./forms";
import { filled } from "./text";
import { lessonOfItem } from "./vocabulary";
import type { Candidate, SpelledChunk, Vocabulary } from "./vocabulary";

/** The articles are not items: they are taught as a pattern, and belong to the noun after them. */
const ARTICLES = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
]);

/** "a" or "de" joined with "el". */
const CONTRACTIONS = new Set(["al", "del"]);
const POSSESSIVE_LEMMAS = new Set(["mi", "tu", "su", "nuestro", "vuestro"]);

const DEMONSTRATIVE_LEMMAS = new Set(["este", "ese", "aquel", "esto", "eso"]);

/** Italian has one word, "molto", for both of these. */
const QUANTITY_LEMMAS = new Set(["muy", "mucho"]);

/** Verbs built like "gustar": the thing liked is the subject. */
const LIKING_LEMMAS = new Set(["gustar", "encantar", "doler"]);

/** The polite "you", which takes the verb form of "he" and "they". */
const POLITE = new Set(["usted", "ustedes"]);

/** The endings of the present tense of a regular verb, by the ending of its infinitive. */
const REGULAR_ENDINGS = new Map([
  ["ar", ["o", "as", "a", "amos", "áis", "an"]],
  ["er", ["o", "es", "e", "emos", "éis", "en"]],
  ["ir", ["o", "es", "e", "imos", "ís", "en"]],
]);

/** One word of the text being analysed. */
interface Word {
  /** As written, without punctuation. */
  t: string;
  lc: string;
  /** The word class or the meaning the author chose with word{pos} or word{meaning}. */
  pick: string | undefined;
  /** Whether the word ends a sentence. */
  end: boolean;
  /** Whether a comma or the end of a sentence follows the word. */
  pause: boolean;
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
  /** The word as taught, such as "levantarse". */
  text: string;
  /** An irregular form taught on its own, such as "soy". */
  irregular: boolean;
}

const UNREAD: Reading = {
  feats: new Set(),
  irregular: false,
  lemma: "",
  pos: "",
  text: "",
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
const OUTER_PUNCTUATION = /^[.,!?¿¡:;"«»()]+|[.,!?¿¡:;"«»()]+$/gu;
const SENTENCE_END = /[.!?:]["»]?$/u;
const PAUSE = /[.,;!?:]["»]?$/u;

const wordOf = (written: string): Word => {
  const { before, pick, after } = PICKED.exec(written)?.groups ?? {};
  const full = pick === undefined ? written : `${before ?? ""}${after ?? ""}`;
  const t = full.replaceAll(OUTER_PUNCTUATION, "");

  return {
    t,
    lc: t.toLowerCase(),
    pick,
    end: SENTENCE_END.test(full),
    pause: PAUSE.test(full),
  };
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

/** An uninflected word spelled exactly like this (para, como) ranks before an inflected form of another word. */
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

  // A capitalised name wins over a word with the same spelling (Rosa / rosa).
  if (names.has(word.lc) && /^\p{Lu}/u.test(word.t) && i > 0) {
    candidates = [];
  }

  const taught = candidates.filter((c) => c.lesson <= a.limit);

  if (taught.length > 0) {
    candidates = taught;
  }

  // An irregular form taught on its own replaces the general entry of the same verb (soy / ser).
  const irregular = new Set(candidates.filter((c) => c.exact).map(lemmaKey));

  return candidates.filter((c) => c.exact || !irregular.has(lemmaKey(c)));
};

/**
 * Two different items share this spelling (como: "I eat" and "as"; para: "for" and "stops").
 * The build picks the most likely one, but the author must confirm the choice by naming it.
 */
const warnIfAmbiguous = (
  a: Analysis,
  word: Word,
  token: Token,
  candidates: Candidate[]
) => {
  const words = new Set(candidates.map((c) => `${c.text}|${c.pos}`));

  if (words.size > 1 && token.c === undefined) {
    const choices = [...new Set(candidates.map((c) => c.pos))]
      .map((pos) => `${word.t}{${pos}}`)
      .join(" or ");

    a.report.warnings.push(
      `${a.where}: "${word.t}" may be ${candidates.map((c) => c.id).join(" or ")}; write ${choices}`
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

/** Other spellings of the same form, for a word with two of them. */
const otherSpellings = (best: Candidate, written: string): string[] => {
  const least = FEAT_ORDER.find((f) => best.feats.has(f));

  // A form the dictionary does not name ("other") is not known to be the same form as any other:
  // "vår", "vårt" and "våre" are three forms, and only one of them fits a given sentence.
  if (best.exact || least === undefined || least === "other") {
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
  if (ARTICLES.has(word.lc) || CONTRACTIONS.has(word.lc)) {
    return;
  }

  if (
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
    text: best.text,
  };
};

// ---------------------------------------------------------------- patterns

/** The ids of the names that are patterns of the curriculum. Other names are dropped. */
const patternIds = (a: Analysis, names: Iterable<string>): string[] =>
  [...names].flatMap((name) =>
    a.vocabulary.info.has(`p:${name}`) ? [`p:${name}`] : []
  );

/** Names of the patterns a verb form exercises. An irregular form taught on its own exercises none. */
const verbPatterns = (lc: string, reading: Reading): string[] => {
  const { feats, lemma, text } = reading;

  if (!isFinite(feats) || reading.irregular) {
    return [];
  }

  const ending = lemma.slice(-2);
  const stem = lemma.slice(0, -2);
  const found = [ending === "ar" ? "pres-ar" : "pres-er-ir"];

  const regular = (REGULAR_ENDINGS.get(ending) ?? []).some(
    (end) => lc === `${stem}${end}`
  );

  // A changed vowel (quiero, puedo) or a first person of its own (tengo, hago).
  if (!regular) {
    found.push("pres-irreg");
  }

  if (text === `${lemma}se`) {
    found.push("reflexive");
  }

  if (LIKING_LEMMAS.has(lemma)) {
    found.push("gustar");
  }

  if (lemma === "estar") {
    found.push("ser-estar");
  }

  return found;
};

/** Names of the patterns a word that changes like an adjective exercises. */
const adjectivePatterns = (feats: Set<Feat>): string[] => {
  if (feats.has("base") || feats.has("other")) {
    return [];
  }

  return feats.has("m-pl") || feats.has("f-pl") ? ["adj", "plural"] : ["adj"];
};

/** Names of the patterns the word at this position exercises, by what the word is. */
const classPatterns = (lc: string, reading: Reading): string[] => {
  const { pos, feats, lemma } = reading;
  const found: string[] = [];

  if (pos === "verb") {
    found.push(...verbPatterns(lc, reading));
  }

  if (pos === "noun" && feats.has("pl") && !feats.has("sg")) {
    found.push("plural");
  }

  if (pos === "adj") {
    found.push(...adjectivePatterns(feats));
  }

  if (POSSESSIVE_LEMMAS.has(lemma) && pos === "det") {
    found.push("possessive");
  }

  if (DEMONSTRATIVE_LEMMAS.has(lemma)) {
    found.push("demonstrative");
  }

  if (QUANTITY_LEMMAS.has(lemma)) {
    found.push("muy-mucho");
  }

  return found;
};

/** Names of the patterns the word at this position exercises. */
const wordPatterns = (a: Analysis, token: Token, i: number): string[] => {
  const word = a.words[i];
  const lc = wordAt(a, i);
  const found = classPatterns(lc, readingAt(a, i));

  if (ARTICLES.has(lc) && token.w === undefined) {
    found.push("articles");
  }

  if (CONTRACTIONS.has(lc) && token.w === undefined) {
    found.push("al-del");
  }

  // "No, gracias" is an answer. "No hablo" is the "not" of a verb.
  if (lc === "no" && word?.pause === false) {
    found.push("neg");
  }

  if (lc === "hay") {
    found.push("hay");
  }

  if (POLITE.has(lc)) {
    found.push("usted");
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

  // Nothing in the text itself names a pattern of the whole sentence: the author adds those with +tag.
  const patterns = new Set<string>();

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
