// Loaders for the raw language data in data/raw (see docs/spec.md, section 5).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAW = join(import.meta.dir, "../../data/raw");

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

const POS_MAP: Record<string, Pos> = {
  subst: "noun",
  verb: "verb",
  adj: "adj",
  adv: "adv",
  pron: "pron",
  prep: "prep",
  konj: "conj",
  sbu: "conj",
  det: "det",
  interj: "interj",
  "inf-merke": "other",
};

function readLatin1(path: string): string {
  return new TextDecoder("latin1").decode(readFileSync(path));
}

export interface Ordbank {
  /** lower-cased word form -> every analysis of it */
  byForm: Map<string, OrdbankForm[]>;
  /** lemma id -> every inflected form */
  byLemma: Map<string, OrdbankForm[]>;
  /** lemma id -> dictionary form */
  lemma: Map<string, string>;
}

export function loadOrdbank(): Ordbank {
  const lemma = new Map<string, string>();

  for (const line of readLatin1(join(RAW, "ordbank/lemma.txt"))
    .split("\n")
    .slice(1)) {
    const [, id, base] = line.split("\t");

    if (id && base) {
      lemma.set(id, base);
    }
  }

  const byForm = new Map<string, OrdbankForm[]>();
  const byLemma = new Map<string, OrdbankForm[]>();

  for (const line of readLatin1(join(RAW, "ordbank/fullformsliste.txt"))
    .split("\n")
    .slice(1)) {
    const cols = line.split("\t");

    if (cols.length < 9) {
      continue;
    }

    const [, lemmaId, form, tag] = cols;

    if (!tag.includes("normert") || tag.includes("unormert")) {
      continue;
    }

    const first = tag.split(" ")[0];
    const pos = POS_MAP[first] ?? "other";
    const entry: OrdbankForm = { lemmaId, form, tag, pos };
    const key = form.toLowerCase();
    const forms = byForm.get(key);

    if (forms) {
      if (!forms.some((f) => f.lemmaId === lemmaId && f.tag === tag)) {
        forms.push(entry);
      }
    } else {
      byForm.set(key, [entry]);
    }

    const lf = byLemma.get(lemmaId);

    if (lf) {
      if (!lf.some((f) => f.form === form && f.tag === tag)) {
        lf.push(entry);
      }
    } else {
      byLemma.set(lemmaId, [entry]);
    }
  }

  return { byForm, byLemma, lemma };
}

/** Subtitle word-form counts, most frequent first. */
export function loadFrequency(): [string, number][] {
  return readFileSync(join(RAW, "freq/no_50k.txt"), "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [w, c] = l.split(" ");

      return [w, Number(c)] as [string, number];
    });
}

export interface Pronunciation {
  ipa: string;
  /** 1 or 2: the pitch accent of the stressed syllable. */
  tone: 1 | 2 | null;
}

/** NB Uttale, Urban East Norwegian. Key: `${form}|${POS tag}` and `${form}`. */
export function loadPronunciation(): Map<string, Pronunciation> {
  const out = new Map<string, Pronunciation>();

  const text = readFileSync(
    join(RAW, "uttale/nb_uttale_leksika/e_written_pronunciation_lexicon.csv"),
    "utf-8"
  );

  for (const line of text.split("\n").slice(1)) {
    // wordform,pos,feats,wordform_id,update_info,nofabet,ipa,sampa — only the last two may be quoted
    const m =
      /^([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),([^,]*),("(?:[^"]|"")*"|[^,]*),/.exec(
        line
      );

    if (!m) {
      continue;
    }

    const [, form, pos, , , , nofabet] = m;
    let ipa = m[7];

    if (ipa.startsWith('"')) {
      ipa = ipa.slice(1, -1).replaceAll('""', '"');
    }

    const toneDigit = /[12]/.exec(nofabet)?.[0];

    const p: Pronunciation = {
      // The lexicon marks tone 1 with ' and tone 2 with "; the app shows tone separately.
      ipa: ipa.replaceAll(/["']/g, "ˈ").replaceAll(".", ""),
      tone: toneDigit ? (Number(toneDigit) as 1 | 2) : null,
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
}
