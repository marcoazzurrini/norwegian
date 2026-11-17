// Ranks dictionary words (lemmas) by how often their forms occur in subtitles.
// Output: data/build/lemma-rank.tsv, used as the guide when choosing curriculum vocabulary.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadFrequency, loadOrdbank } from './lib/sources'

const ob = loadOrdbank()
const score = new Map<string, number>()

for (const [form, count] of loadFrequency()) {
  let analyses = ob.byForm.get(form) ?? []
  // A bare imperative reading (e.g. "hus!" from "huse") is rarely the intended one.
  const nonImp = analyses.filter((a) => !a.tag.includes(' imp'))
  if (nonImp.length) analyses = nonImp
  const lemmas = [...new Set(analyses.map((a) => `${a.lemmaId}|${a.pos}`))]
  for (const key of lemmas) score.set(key, (score.get(key) ?? 0) + count / lemmas.length)
}

const rows = [...score.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6000)
  .map(([key, s], i) => {
    const [id, pos] = key.split('|')
    const gender = ob.byLemma.get(id)?.[0]?.tag.match(/\b(mask|fem|nøyt)\b/)?.[1] ?? ''
    return [i + 1, ob.lemma.get(id), pos, gender, Math.round(s)].join('\t')
  })

const out = join(import.meta.dir, '../data/build')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'lemma-rank.tsv'), rows.join('\n') + '\n')
console.log(`wrote ${rows.length} lemmas`)
