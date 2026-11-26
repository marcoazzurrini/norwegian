// Loaders for the raw language data in data/raw, and for the forms the course adds by hand in text/forms.txt.
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Report } from "./draft";
import { fields, listOf } from "./text";

const ROOT = path.join(import.meta.dir, "../..");
const RAW = path.join(ROOT, "data/raw");

/** One row of UniMorph: a form of a dictionary word, with what it is ("V;IND;PRS;1;SG"). */
export interface LexForm {
  form: string;
  tag: string;
}

/** A form written in text/forms.txt, with what it is in the words of the build ("p1", "pl"). */
export interface ExtraForm {
  form: string;
  feat: string;
}

/** The language data the build looks words up in. */
export interface Lexicon {
  /** dictionary word -> its forms. A verb has only its infinitive and its present tense here. */
  byLemma: Map<string, LexForm[]>;
  /** noun form -> the dictionary words it belongs to */
  nounLemmas: Map<string, Set<string>>;
  /** "word|class" -> the forms written in text/forms.txt. They replace those of UniMorph. */
  extra: Map<string, ExtraForm[]>;
  /** lower-cased word form -> how often it occurs in subtitles */
  frequency: Map<string, number>;
}

/** The rows of a verb the course can use at its level: the infinitive and the present tense. */
const taughtVerbRow = (tag: string) =>
  tag === "V;NFIN" || tag.startsWith("V;IND;PRS;");

/** UniMorph for Spanish: "lemma<TAB>form<TAB>features", one form to a line. */
const loadUniMorph = (): Pick<Lexicon, "byLemma" | "nounLemmas"> => {
  const byLemma = new Map<string, LexForm[]>();
  const nounLemmas = new Map<string, Set<string>>();
  const text = readFileSync(path.join(RAW, "unimorph/spa"), "utf-8");

  for (const line of text.split("\n")) {
    const [lemma, form, tag] = line.split("\t");

    if (lemma === undefined || form === undefined || tag === undefined) {
      continue;
    }

    if (tag.startsWith("V;") && !taughtVerbRow(tag)) {
      continue;
    }

    const rows = byLemma.get(lemma) ?? [];

    rows.push({ form, tag });
    byLemma.set(lemma, rows);

    if (tag.startsWith("N;")) {
      const lemmas = nounLemmas.get(form) ?? new Set<string>();

      lemmas.add(lemma);
      nounLemmas.set(form, lemmas);
    }
  }

  return { byLemma, nounLemmas };
};

/** Subtitle word-form counts. */
const loadFrequency = (): Map<string, number> =>
  new Map(
    readFileSync(path.join(RAW, "freq/es_50k.txt"), "utf-8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line): [string, number] => {
        const [word = "", count] = line.split(" ");

        return [word, Number(count)];
      })
  );

/** text/forms.txt: "tener | verb | tengo=p1 tienes=p2". The format is at the top of that file. */
const loadExtra = (report: Report): Map<string, ExtraForm[]> => {
  const extra = new Map<string, ExtraForm[]>();
  const text = readFileSync(path.join(ROOT, "text/forms.txt"), "utf-8");

  for (const line of listOf(text, "\n")) {
    if (line.startsWith("#")) {
      continue;
    }

    const [lemma = "", pos = "", written = ""] = fields(line);

    if (lemma === "" || pos === "") {
      report.errors.push(`forms.txt: "${line}" needs a word and a class`);

      continue;
    }

    const forms = listOf(written, " ").map((pair) => {
      const [form = "", feat = ""] = pair.split("=");

      if (form === "" || feat === "") {
        report.errors.push(`forms.txt: "${pair}" must be written form=what`);
      }

      return { feat, form };
    });

    extra.set(`${lemma}|${pos}`, forms);
  }

  return extra;
};

export const loadLexicon = (report: Report): Lexicon => ({
  ...loadUniMorph(),
  extra: loadExtra(report),
  frequency: loadFrequency(),
});
