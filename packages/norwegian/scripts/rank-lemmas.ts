// Ranks dictionary words (lemmas) by how often their forms occur in subtitles.
// Output: data/build/lemma-rank.tsv, used as the guide when choosing curriculum vocabulary.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadFrequency, loadOrdbank } from "./lib/sources";

const ob = loadOrdbank();
const score = new Map<string, number>();

for (const [form, count] of loadFrequency()) {
  let analyses = ob.byForm.get(form) ?? [];
  // A bare imperative reading (e.g. "hus!" from "huse") is rarely the intended one.
  const nonImp = analyses.filter((a) => !a.tag.includes(" imp"));

  if (nonImp.length > 0) {
    analyses = nonImp;
  }

  const lemmas = [...new Set(analyses.map((a) => `${a.lemmaId}|${a.pos}`))];

  for (const key of lemmas) {
    score.set(key, (score.get(key) ?? 0) + count / lemmas.length);
  }
}

const GENDER = /\b(?<gender>mask|fem|nøyt)\b/u;

const rows = [...score.entries()]
  .toSorted((a, b) => b[1] - a[1])
  .slice(0, 6000)
  .map(([key, s], i) => {
    const [id = "", pos = ""] = key.split("|");
    const [first] = ob.byLemma.get(id) ?? [];
    const gender = GENDER.exec(first?.tag ?? "")?.groups?.gender ?? "";

    return [i + 1, ob.lemma.get(id), pos, gender, Math.round(s)].join("\t");
  });

const out = path.join(import.meta.dir, "../data/build");

mkdirSync(out, { recursive: true });

writeFileSync(path.join(out, "lemma-rank.tsv"), `${rows.join("\n")}\n`);

console.log(`wrote ${rows.length} lemmas`);
