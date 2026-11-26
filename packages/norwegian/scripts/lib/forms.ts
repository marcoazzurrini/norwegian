// The inflected forms of a word, from Norsk Ordbank: which spellings belong to it, and what each one is.
import type { FormRow } from "@norsk/course";

import type { Gender } from "./gender";
import type { Lexicon, OrdbankForm, Pos } from "./sources";
import { filled } from "./text";

/** What a form is: a definite singular, a past tense, and so on. */
export type Feat =
  | "sg"
  | "sg-def"
  | "pl"
  | "pl-def"
  | "inf"
  | "pres"
  | "pret"
  | "perf"
  | "imp"
  | "base"
  | "neut"
  | "e-form"
  | "comp"
  | "sup"
  | "other";

/** The forms of one word: lower-cased spelling -> what it can be. */
export type Forms = Map<string, Set<Feat>>;

/** Order from least to most marked, used to pick a reading for an ambiguous form. */
export const FEAT_ORDER: Feat[] = [
  "sg",
  "inf",
  "base",
  "pres",
  "sg-def",
  "pl",
  "pl-def",
  "pret",
  "perf",
  "imp",
  "neut",
  "e-form",
  "comp",
  "sup",
  "other",
];

// The three functions below take an Ordbank tag with a space added at each end, so that whole words can be matched.

const nounFeat = (t: string): Feat | null => {
  if (t.includes(" gen ")) {
    return null;
  }

  if (t.includes(" ent ub ")) {
    return "sg";
  }

  if (t.includes(" ent be ")) {
    return "sg-def";
  }

  if (t.includes(" fl ub ")) {
    return "pl";
  }

  if (t.includes(" fl be ")) {
    return "pl-def";
  }

  return "other";
};

const verbFeat = (t: string): Feat | null => {
  if (t.includes(" pass ")) {
    return null;
  }

  if (t.includes(" inf ")) {
    return "inf";
  }

  if (t.includes(" pres ")) {
    return "pres";
  }

  if (t.includes(" pret ")) {
    return "pret";
  }

  if (t.includes(" perf-part ")) {
    return "perf";
  }

  if (t.includes(" imp ")) {
    return "imp";
  }

  return "other";
};

const adjFeat = (t: string): Feat | null => {
  if (t.includes("-part>")) {
    return null;
  }

  if (t.includes(" komp ")) {
    return "comp";
  }

  if (t.includes(" sup ")) {
    return "sup";
  }

  if (t.includes(" nøyt ub ent ")) {
    return "neut";
  }

  if (t.includes(" ub ent ")) {
    return "base";
  }

  if (t.includes(" fl ") || t.includes(" be ent ")) {
    return "e-form";
  }

  return "other";
};

/** What the form with this Ordbank tag is, or null for forms that are not taught (genitive, passive, participles). */
const featOf = (tag: string): Feat | null => {
  const t = ` ${tag} `;

  if (t.startsWith(" subst ")) {
    return nounFeat(t);
  }

  if (t.startsWith(" verb ")) {
    return verbFeat(t);
  }

  if (t.startsWith(" adj ")) {
    return adjFeat(t);
  }

  return "other";
};

/** The Ordbank word class for a word class of the unit files. Numbers are determiners there. */
const ORDBANK_POS = new Map<string, Pos>([
  ["noun", "noun"],
  ["verb", "verb"],
  ["adj", "adj"],
  ["adv", "adv"],
  ["pron", "pron"],
  ["prep", "prep"],
  ["conj", "conj"],
  ["det", "det"],
  ["num", "det"],
  ["interj", "interj"],
  ["other", "other"],
]);

const GENDER_TAG = { ei: "fem", en: "mask", et: "nøyt" } as const;

/** Whether the lemma has a form of this gender. A plural-only noun has no gender to check. */
const hasGender = (
  lexicon: Lexicon,
  lemmaId: string,
  gender: Gender | undefined
): boolean => {
  if (gender === undefined || gender === "pl") {
    return true;
  }

  const tag = ` ${GENDER_TAG[gender]} `;
  const forms = lexicon.ordbank.byLemma.get(lemmaId) ?? [];

  return forms.some((f) => f.tag.includes(tag));
};

/** Ids of the Ordbank lemmas spelled like this, of this word class and gender. */
const lemmaIds = (
  lexicon: Lexicon,
  lemma: string,
  pos: string,
  gender: Gender | undefined
): Set<string> => {
  const { ordbank } = lexicon;
  const want = ORDBANK_POS.get(pos) ?? "other";
  const ids = new Set<string>();

  for (const a of ordbank.byForm.get(lemma.toLowerCase()) ?? []) {
    if (ordbank.lemma.get(a.lemmaId)?.toLowerCase() !== lemma.toLowerCase()) {
      continue;
    }

    if (a.pos !== want && !(pos === "num" && a.pos === "det")) {
      continue;
    }

    if (pos === "noun" && !hasGender(lexicon, a.lemmaId, gender)) {
      continue;
    }

    ids.add(a.lemmaId);
  }

  return ids;
};

/** The forms of the lemma whose forms are most frequent in speech. */
const mostFrequentForms = (
  lexicon: Lexicon,
  ids: Set<string>,
  pos: string
): OrdbankForm[] => {
  const want = ORDBANK_POS.get(pos) ?? "other";
  let best: OrdbankForm[] = [];
  let bestScore = -1;

  for (const id of ids) {
    const forms = (lexicon.ordbank.byLemma.get(id) ?? []).filter(
      (f) =>
        f.pos === want || (pos === "num" && f.pos === "det") || want === "verb"
    );

    const score = [...new Set(forms.map((f) => f.form.toLowerCase()))].reduce(
      (sum, form) => sum + (lexicon.frequency.get(form) ?? 0),
      0
    );

    if (score > bestScore) {
      best = forms;
      bestScore = score;
    }
  }

  return best;
};

/** Forms of the best-matching lemma, or null when Ordbank does not have the word. */
export const lemmaForms = (
  lexicon: Lexicon,
  lemma: string,
  pos: string,
  gender?: Gender
): Forms | null => {
  const ids = lemmaIds(lexicon, lemma, pos, gender);

  if (ids.size === 0) {
    return null;
  }

  const out: Forms = new Map();

  // Homonyms (bok: "boker" and "bøker") — keep the lemma whose forms are most frequent in speech.
  for (const f of mostFrequentForms(lexicon, ids, pos)) {
    if (pos === "noun" && gender === "en" && f.tag.includes(" fem ")) {
      continue;
    }

    const feat = featOf(f.tag);

    if (feat === null) {
      continue;
    }

    const key = f.form.toLowerCase();
    const feats = out.get(key) ?? new Set<Feat>();

    feats.add(feat);
    out.set(key, feats);
  }

  return out;
};

/** The form to show for a feature: the first that matches a preferred ending, else the most frequent. */
const pickForm = (
  lexicon: Lexicon,
  forms: Forms,
  feat: Feat,
  prefer: RegExp[]
): string | undefined => {
  const all = [...forms].flatMap(([form, feats]) =>
    feats.has(feat) ? [form] : []
  );

  for (const re of prefer) {
    const hit = all.find((f) => re.test(f));

    if (filled(hit)) {
      return hit;
    }
  }

  const [mostFrequent] = all.toSorted(
    (a, b) => (lexicon.frequency.get(b) ?? 0) - (lexicon.frequency.get(a) ?? 0)
  );

  return mostFrequent;
};

/** The rows of the form table shown for a word. A row without a form is left out. */
export const formTable = (
  lexicon: Lexicon,
  pos: string,
  gender: Gender | undefined,
  forms: Forms
): FormRow[] => {
  const pick = (feat: Feat, prefer: RegExp[] = []) =>
    pickForm(lexicon, forms, feat, prefer);

  const rows: [string, string | undefined][] = [];

  if (pos === "noun") {
    rows.push(
      ["a", pick("sg")],
      ["the", pick("sg-def", gender === "ei" ? [/a$/u] : [/e[nt]$/u])],
      ["several", pick("pl", [/er$/u, /e$/u])],
      ["the several", pick("pl-def", [/ene$/u])]
    );
  } else if (pos === "verb") {
    rows.push(
      ["to", pick("inf")],
      ["now", pick("pres")],
      ["past", pick("pret", [/et$/u, /te$/u, /de$/u])],
      ["have", pick("perf", [/et$/u, /t$/u])]
    );
  } else if (pos === "adj") {
    rows.push(
      ["en / ei", pick("base")],
      ["et", pick("neut")],
      ["several", pick("e-form")]
    );
  }

  return rows.flatMap(([label, form]) =>
    filled(form) ? [{ label, form }] : []
  );
};
