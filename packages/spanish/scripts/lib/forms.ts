// The inflected forms of a word: which spellings belong to it, and what each one is.
// They come from UniMorph, or from text/forms.txt for a word UniMorph lacks or has wrong.
import type { FormRow } from "@norsk/course";

import type { Lexicon } from "./sources";
import { filled } from "./text";

/**
 * What a form is. "p1" to "p6" are the six persons of the present tense: yo, tú, él, nosotros,
 * vosotros, ellos. "base" is the form an adjective is listed under, the masculine singular.
 */
export type Feat =
  | "sg"
  | "pl"
  | "base"
  | "fem"
  | "m-pl"
  | "f-pl"
  | "inf"
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "other";

const FEATS = new Set<string>([
  "sg",
  "pl",
  "base",
  "fem",
  "m-pl",
  "f-pl",
  "inf",
  "p1",
  "p2",
  "p3",
  "p4",
  "p5",
  "p6",
  "other",
]);

const isFeat = (s: string): s is Feat => FEATS.has(s);

/** The forms of one word: lower-cased spelling -> what it can be. */
export type Forms = Map<string, Set<Feat>>;

/** Order from least to most marked, used to pick a reading for an ambiguous form. */
export const FEAT_ORDER: Feat[] = [
  "sg",
  "inf",
  "base",
  "p3",
  "p1",
  "p2",
  "p4",
  "p5",
  "p6",
  "pl",
  "fem",
  "m-pl",
  "f-pl",
  "other",
];

/** The persons of the present tense, in the order of a verb table. */
export const PERSONS: Feat[] = ["p1", "p2", "p3", "p4", "p5", "p6"];

/** Whether a reading is a verb form with a person: "hablo", not "hablar". */
export const isFinite = (feats: Set<Feat>): boolean =>
  PERSONS.some((person) => feats.has(person));

const add = (forms: Forms, form: string, feat: Feat) => {
  const key = form.toLowerCase();
  const feats = forms.get(key) ?? new Set<Feat>();

  feats.add(feat);
  forms.set(key, feats);
};

const PERSON_BY_TAG = new Map<string, Feat>([
  ["1;SG", "p1"],
  ["2;SG;INFM", "p2"],
  ["3;SG", "p3"],
  ["1;PL", "p4"],
  ["2;PL", "p5"],
  ["3;PL", "p6"],
]);

/** The infinitive and the present tense of a verb, or null when UniMorph has no present for it. */
const verbForms = (lexicon: Lexicon, lemma: string): Forms | null => {
  const out: Forms = new Map();
  let hasTu = false;

  for (const { form, tag } of lexicon.byLemma.get(lemma) ?? []) {
    const person = PERSON_BY_TAG.get(tag.slice("V;IND;PRS;".length));

    if (tag === "V;NFIN") {
      add(out, form, "inf");
    } else if (person === "p2" && hasTu) {
      // UniMorph lists the form for "vos" (hablás) after the one for "tú". Spain only uses "tú".
      continue;
    } else if (person !== undefined) {
      hasTu ||= person === "p2";
      add(out, form, person);
    }
  }

  return [...out.values()].some(isFinite) ? out : null;
};

/** UniMorph's name for the gender a noun is learned with. */
const genderTag = (article: string | undefined, feminine: boolean): string =>
  feminine || article === "la" || article === "las" ? "FEM" : "MASC";

/** The singular and plural of a noun in one gender, or null when UniMorph does not have it. */
const nounForms = (
  lexicon: Lexicon,
  lemma: string,
  gender: string
): Forms | null => {
  // "hermana" is listed under "hermano": look for the word among the forms too.
  const lemmas = [lemma, ...(lexicon.nounLemmas.get(lemma) ?? [])];

  for (const one of lemmas) {
    const out: Forms = new Map();

    for (const { form, tag } of lexicon.byLemma.get(one) ?? []) {
      if (tag.startsWith("N;") && tag.includes(gender)) {
        add(out, form, tag.endsWith(";PL") ? "pl" : "sg");
      }
    }

    if (out.get(lemma.toLowerCase())?.has("sg") === true) {
      return out;
    }
  }

  return null;
};

/** The forms of an adjective, or of a word that changes like one (mucho, este), or null. */
const adjectiveForms = (lexicon: Lexicon, lemma: string): Forms | null => {
  const out: Forms = new Map();

  for (const { form, tag } of lexicon.byLemma.get(lemma) ?? []) {
    if (tag === "ADJ;FEM;SG") {
      add(out, form, "fem");
    } else if (tag === "ADJ;MASC;PL") {
      add(out, form, "m-pl");
    } else if (tag === "ADJ;FEM;PL") {
      add(out, form, "f-pl");
    } else if (tag === "ADJ;PL") {
      // One plural for both genders: grandes, jóvenes.
      add(out, form, "m-pl");
      add(out, form, "f-pl");
    }
  }

  if (out.size === 0) {
    return null;
  }

  add(out, lemma, "base");

  return out;
};

/** The form a word is listed under, for a word whose forms are written in text/forms.txt. */
const LISTED_AS = new Map<string, Feat>([
  ["verb", "inf"],
  ["noun", "sg"],
]);

/** The forms written by hand for a word, or null when there are none. */
const extraForms = (
  lexicon: Lexicon,
  lemma: string,
  pos: string
): Forms | null => {
  const written = lexicon.extra.get(`${lemma}|${pos}`);

  if (written === undefined) {
    return null;
  }

  const out: Forms = new Map();

  add(out, lemma, LISTED_AS.get(pos) ?? "base");

  for (const { form, feat } of written) {
    if (isFeat(feat)) {
      add(out, form, feat);
    }
  }

  return out;
};

export interface LemmaOptions {
  /** The article a noun is learned with. */
  article?: string | undefined;
  /** A feminine noun that takes "el", such as "el agua". */
  feminine?: boolean;
}

/** Every form of a dictionary word, or null when neither text/forms.txt nor UniMorph has it. */
export const lemmaForms = (
  lexicon: Lexicon,
  lemma: string,
  pos: string,
  options: LemmaOptions = {}
): Forms | null => {
  const extra = extraForms(lexicon, lemma, pos);

  if (extra !== null) {
    return extra;
  }

  if (pos === "verb") {
    return verbForms(lexicon, lemma);
  }

  if (pos === "noun") {
    return nounForms(
      lexicon,
      lemma,
      genderTag(options.article, options.feminine === true)
    );
  }

  return pos === "adj" || pos === "det" || pos === "num"
    ? adjectiveForms(lexicon, lemma)
    : null;
};

/** The pronoun that goes with each person of a reflexive verb: me levanto, te levantas. */
const REFLEXIVE = new Map<Feat, string>([
  ["p1", "me"],
  ["p2", "te"],
  ["p3", "se"],
  ["p4", "nos"],
  ["p5", "os"],
  ["p6", "se"],
]);

const PERSON_LABEL = new Map<Feat, string>([
  ["p1", "yo"],
  ["p2", "tú"],
  ["p3", "él / ella"],
  ["p4", "nosotros"],
  ["p5", "vosotros"],
  ["p6", "ellos / ellas"],
]);

/** The rows of the form table shown for a word. A row without a form is left out. */
export const formTable = (
  lexicon: Lexicon,
  pos: string,
  forms: Forms,
  reflexive: boolean
): FormRow[] => {
  /** The form to show for a feature: the one most frequent in speech. */
  const pick = (feat: Feat): string | undefined => {
    const [mostFrequent] = [...forms]
      .flatMap(([form, feats]) => (feats.has(feat) ? [form] : []))
      .toSorted(
        (a, b) =>
          (lexicon.frequency.get(b) ?? 0) - (lexicon.frequency.get(a) ?? 0)
      );

    return mostFrequent;
  };

  const rows: [string, string | undefined][] = [];

  if (pos === "noun") {
    rows.push(["singolare", pick("sg")], ["plurale", pick("pl")]);
  } else if (pos === "verb") {
    for (const person of PERSONS) {
      const form = pick(person);
      const pronoun = reflexive ? `${REFLEXIVE.get(person) ?? ""} ` : "";

      rows.push([
        PERSON_LABEL.get(person) ?? "",
        form === undefined ? undefined : `${pronoun}${form}`,
      ]);
    }
  } else if (pick("fem") === undefined && pick("m-pl") === pick("f-pl")) {
    // One form for both genders: grande, grandes.
    rows.push(["singolare", pick("base")], ["plurale", pick("m-pl")]);
  } else {
    rows.push(
      ["maschile", pick("base")],
      ["femminile", pick("fem")],
      ["plurale maschile", pick("m-pl")],
      ["plurale femminile", pick("f-pl")]
    );
  }

  return rows.flatMap(([label, form]) =>
    filled(form) ? [{ label, form }] : []
  );
};
