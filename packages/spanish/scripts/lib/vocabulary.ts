// What is taught, arranged so that the words of a text can be looked up in it.
import type { Draft, ItemInfo } from "./draft";
import { lemmaForms } from "./forms";
import type { Feat, Forms } from "./forms";
import type { Lexicon } from "./sources";
import { wordsOf } from "./text";

/** A word item that a spelling may stand for. */
export interface Candidate {
  id: string;
  /** What this spelling is for that word. */
  feats: Set<Feat>;
  exact: boolean;
  lesson: number;
  pos: string;
  /** The word as taught. */
  text: string;
  lemma: string;
  /** Every spelling of the word. */
  forms: Forms;
  /** The name of this meaning, when the word is taught once for each of its meanings. */
  sense: string | undefined;
}

/** A chunk, as the spellings each of its words may take. A slot (___) separates the parts. */
export interface SpelledChunk {
  id: string;
  size: number;
  parts: Set<string>[][];
}

/** What is taught, arranged for looking up the words of a text. */
export interface Vocabulary {
  info: Map<string, ItemInfo>;
  /** lower-cased spelling -> the words it may be */
  formIndex: Map<string, Candidate[]>;
  /** Longest first. */
  chunks: SpelledChunk[];
  /** Lower-cased names from text/names.txt: allowed in a text without being taught. */
  names: Set<string>;
}

const REFLEXIVES = ["se", "me", "te", "nos", "os"];

/** A preposition and what it becomes when "el" follows. */
const JOINED_WITH_EL = new Map([
  ["a", "al"],
  ["de", "del"],
]);

/** Spellings a chunk word may take in a sentence: a verb may be inflected (tener / tengo / tienes), "se" may be any reflexive, "de" may be "del". */
const chunkWordForms = (lexicon: Lexicon, word: string): Set<string> => {
  const out = new Set([word]);

  if (word === "se") {
    for (const r of REFLEXIVES) {
      out.add(r);
    }
  }

  // Before "el" the two join: "cerca de" is also "cerca del".
  const joined = JOINED_WITH_EL.get(word);

  if (joined !== undefined) {
    out.add(joined);
  }

  const verb = lemmaForms(lexicon, word, "verb");

  if (verb?.get(word)?.has("inf") === true) {
    for (const form of verb.keys()) {
      out.add(form);
    }
  }

  return out;
};

const formIndexOf = (info: Map<string, ItemInfo>) => {
  const formIndex = new Map<string, Candidate[]>();

  for (const [id, { item, forms, exact, lemma, sense }] of info) {
    const { pos } = item;

    // Every word has a word class; the check is for the compiler.
    if (item.kind !== "word" || pos === undefined) {
      continue;
    }

    for (const [form, feats] of forms) {
      const candidates = formIndex.get(form) ?? [];

      candidates.push({
        id,
        feats,
        exact,
        lesson: item.lesson,
        pos,
        text: item.text,
        lemma,
        forms,
        sense,
      });
      formIndex.set(form, candidates);
    }
  }

  return formIndex;
};

const spelledChunksOf = (info: Map<string, ItemInfo>, lexicon: Lexicon) => {
  const chunks: SpelledChunk[] = [];

  for (const { item } of info.values()) {
    if (item.kind === "chunk") {
      chunks.push({
        id: item.id,
        size: wordsOf(item.text.replaceAll("___", " ")).length,
        parts: item.text
          .split("___")
          .map((part) =>
            wordsOf(part).map((word) => chunkWordForms(lexicon, word))
          ),
      });
    }
  }

  return chunks.toSorted((a, b) => b.size - a.size);
};

export const vocabularyOf = (
  draft: Draft,
  names: Set<string>,
  lexicon: Lexicon
): Vocabulary => ({
  info: draft.info,
  formIndex: formIndexOf(draft.info),
  chunks: spelledChunksOf(draft.info, lexicon),
  names,
});

/** The lesson that teaches an item. */
export const lessonOfItem = (vocabulary: Vocabulary, id: string): number => {
  const known = vocabulary.info.get(id);

  if (known === undefined) {
    throw new Error(`Unknown item ${id}`);
  }

  return known.item.lesson;
};
