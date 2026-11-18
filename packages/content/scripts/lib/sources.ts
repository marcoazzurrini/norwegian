// Loaders for the raw language data in data/raw (see docs/spec.md, section 5).
import { readFileSync } from "node:fs";
import path from "node:path";

import { filled } from "./text";

const RAW = path.join(import.meta.dir, "../../data/raw");

export type Pos =
  | "noun"
  | "verb"
  | "adj"
  | "adv"
  | "pron"
  | "prep"
  | "conj"
  | "det"
  | "interj"
  | "num"
  | "other";

export interface OrdbankForm {
  lemmaId: string;
  form: string;
  tag: string;
  pos: Pos;
}

/** Word class by the first word of a Norsk Ordbank tag. */
const POS_BY_TAG = new Map<string, Pos>([
  ["subst", "noun"],
  ["verb", "verb"],
  ["adj", "adj"],
  ["adv", "adv"],
  ["pron", "pron"],
  ["prep", "prep"],
  ["konj", "conj"],
  ["sbu", "conj"],
  ["det", "det"],
  ["interj", "interj"],
  ["inf-merke", "other"],
]);

const readLatin1 = (file: string): string =>
  new TextDecoder("latin1").decode(readFileSync(file));

/** The rows of a tab-separated file, without its header row. */
const rowsOf = (text: string): string[][] =>
  text
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"));

export interface Ordbank {
  /** lower-cased word form -> every analysis of it */
  byForm: Map<string, OrdbankForm[]>;
  /** lemma id -> every inflected form */
  byLemma: Map<string, OrdbankForm[]>;
  /** lemma id -> dictionary form */
  lemma: Map<string, string>;
}

/** Adds an entry to the list under a key, unless the list already has one like it. */
const addUnlessListed = (
  index: Map<string, OrdbankForm[]>,
  key: string,
  entry: OrdbankForm,
  same: (other: OrdbankForm) => boolean
) => {
  const listed = index.get(key);

  if (listed === undefined) {
    index.set(key, [entry]);
  } else if (!listed.some(same)) {
    listed.push(entry);
  }
};

export const loadOrdbank = (): Ordbank => {
  const lemma = new Map<string, string>();

  for (const [, id, base] of rowsOf(
    readLatin1(path.join(RAW, "ordbank/lemma.txt"))
  )) {
    if (filled(id) && filled(base)) {
      lemma.set(id, base);
    }
  }

  const byForm = new Map<string, OrdbankForm[]>();
  const byLemma = new Map<string, OrdbankForm[]>();

  for (const cols of rowsOf(
    readLatin1(path.join(RAW, "ordbank/fullformsliste.txt"))
  )) {
    const [, lemmaId, form, tag] = cols;

    // A full row has nine columns. The three checks after it only tell the compiler what that means.
    if (
      cols.length < 9 ||
      lemmaId === undefined ||
      form === undefined ||
      tag === undefined
    ) {
      continue;
    }

    if (!tag.includes("normert") || tag.includes("unormert")) {
      continue;
    }

    const [first = ""] = tag.split(" ");
    const pos = POS_BY_TAG.get(first) ?? "other";
    const entry: OrdbankForm = { form, lemmaId, pos, tag };

    addUnlessListed(
      byForm,
      form.toLowerCase(),
      entry,
      (f) => f.lemmaId === lemmaId && f.tag === tag
    );
    addUnlessListed(
      byLemma,
      lemmaId,
      entry,
      (f) => f.form === form && f.tag === tag
    );
  }

  return { byForm, byLemma, lemma };
};

/** Subtitle word-form counts, most frequent first. */
export const loadFrequency = (): [string, number][] =>
  readFileSync(path.join(RAW, "freq/no_50k.txt"), "utf-8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line): [string, number] => {
      const [word = "", count] = line.split(" ");

      return [word, Number(count)];
    });

export interface Pronunciation {
  ipa: string;
  /** 1 or 2: the pitch accent of the stressed syllable. */
  tone: 1 | 2 | null;
}

// wordform,pos,feats,wordform_id,update_info,nofabet,ipa,sampa — only the last two may be quoted
const LEXICON_ROW =
  /^(?<form>[^,]*),(?<pos>[^,]*),[^,]*,[^,]*,[^,]*,(?<nofabet>[^,]*),(?<ipa>"(?:[^"]|"")*"|[^,]*),/u;

/** The tone is the first 1 or 2 in the NoFAbet transcription. */
const toneOf = (nofabet: string): 1 | 2 | null => {
  const digit = /[12]/u.exec(nofabet)?.[0];

  if (digit === "1") {
    return 1;
  }

  return digit === "2" ? 2 : null;
};

const unquoted = (field: string) =>
  field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field;

/** NB Uttale, Urban East Norwegian. Key: `${form}|${POS tag}` and `${form}`. */
export const loadPronunciation = (): Map<string, Pronunciation> => {
  const out = new Map<string, Pronunciation>();

  const text = readFileSync(
    path.join(
      RAW,
      "uttale/nb_uttale_leksika/e_written_pronunciation_lexicon.csv"
    ),
    "utf-8"
  );

  for (const line of text.split("\n").slice(1)) {
    const { form, pos, nofabet, ipa } = LEXICON_ROW.exec(line)?.groups ?? {};

    // A line that matches has all four. A line that does not match has none.
    if (
      form === undefined ||
      pos === undefined ||
      nofabet === undefined ||
      ipa === undefined
    ) {
      continue;
    }

    const p: Pronunciation = {
      // The lexicon marks tone 1 with ' and tone 2 with "; the app shows tone separately.
      ipa: unquoted(ipa).replaceAll(/["']/gu, "ˈ").replaceAll(".", ""),
      tone: toneOf(nofabet),
    };

    const key = form.toLowerCase();

    if (!out.has(`${key}|${pos}`)) {
      out.set(`${key}|${pos}`, p);
    }

    if (!out.has(key)) {
      out.set(key, p);
    }
  }

  return out;
};

/** The language data the build looks words up in. */
export interface Lexicon {
  ordbank: Ordbank;
  /** lower-cased word form -> how often it occurs in subtitles */
  frequency: Map<string, number>;
  pronunciation: Map<string, Pronunciation>;
}

export const loadLexicon = (): Lexicon => ({
  frequency: new Map(loadFrequency()),
  ordbank: loadOrdbank(),
  pronunciation: loadPronunciation(),
});
