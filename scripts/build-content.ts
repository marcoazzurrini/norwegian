// Builds src/content/curriculum.json from the files in content/.
// Run: bun scripts/build-content.ts            (build and check everything)
//      bun scripts/build-content.ts --unit 3   (also print a report for unit 3)
// The file format is described in content/README.md.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  Curriculum,
  Example,
  FormRow,
  Item,
  Lesson,
  Quiz,
  Sentence,
  SoundPair,
  Story,
  Token,
  Unit,
} from '../src/content/types'
import { loadFrequency, loadOrdbank, loadPronunciation, type OrdbankForm } from './lib/sources'

const ROOT = join(import.meta.dir, '..')
const errors: string[] = []
const warnings: string[] = []

const ob = loadOrdbank()
const pron = loadPronunciation()
const freq = new Map(loadFrequency())

// ---------------------------------------------------------------- features

type Feat =
  | 'sg' | 'sg-def' | 'pl' | 'pl-def'
  | 'inf' | 'pres' | 'pret' | 'perf' | 'imp'
  | 'base' | 'neut' | 'e-form' | 'comp' | 'sup'
  | 'other'

/** Order from least to most marked, used to pick a reading for an ambiguous form. */
const FEAT_ORDER: Feat[] = [
  'sg', 'inf', 'base', 'pres', 'sg-def', 'pl', 'pl-def', 'pret', 'perf', 'imp', 'neut', 'e-form', 'comp', 'sup', 'other',
]

function featOf(tag: string): Feat | null {
  const t = ` ${tag} `
  if (t.startsWith(' subst ')) {
    if (t.includes(' gen ')) return null
    if (t.includes(' ent ub ')) return 'sg'
    if (t.includes(' ent be ')) return 'sg-def'
    if (t.includes(' fl ub ')) return 'pl'
    if (t.includes(' fl be ')) return 'pl-def'
    return 'other'
  }
  if (t.startsWith(' verb ')) {
    if (t.includes(' pass ')) return null
    if (t.includes(' inf ')) return 'inf'
    if (t.includes(' pres ')) return 'pres'
    if (t.includes(' pret ')) return 'pret'
    if (t.includes(' perf-part ')) return 'perf'
    if (t.includes(' imp ')) return 'imp'
    return 'other'
  }
  if (t.startsWith(' adj ')) {
    if (t.includes('-part>')) return null
    if (t.includes(' komp ')) return 'comp'
    if (t.includes(' sup ')) return 'sup'
    if (t.includes(' nøyt ub ent ')) return 'neut'
    if (t.includes(' ub ent ')) return 'base'
    if (t.includes(' fl ') || t.includes(' be ent ')) return 'e-form'
    return 'other'
  }
  return 'other'
}

const OB_POS: Record<string, string> = {
  noun: 'noun', verb: 'verb', adj: 'adj', adv: 'adv', pron: 'pron', prep: 'prep',
  conj: 'conj', det: 'det', num: 'det', interj: 'interj', other: 'other',
}
const GENDER_TAG = { en: 'mask', ei: 'fem', et: 'nøyt' } as const
const UTTALE_POS: Record<string, string> = {
  noun: 'NN', verb: 'VB', adj: 'JJ', adv: 'AB', pron: 'PN', prep: 'PP', conj: 'KN', det: 'DT', num: 'RG', interj: 'IN',
}

/** Forms of the best-matching lemma: lower-cased form -> its features. */
function lemmaForms(lemma: string, pos: string, gender?: string): Map<string, Set<Feat>> | null {
  const want = OB_POS[pos] ?? 'other'
  const ids = new Set<string>()
  for (const a of ob.byForm.get(lemma.toLowerCase()) ?? []) {
    if (ob.lemma.get(a.lemmaId)?.toLowerCase() !== lemma.toLowerCase()) continue
    if (a.pos !== want && !(pos === 'num' && a.pos === 'det')) continue
    if (pos === 'noun' && gender && gender !== 'pl') {
      const forms = ob.byLemma.get(a.lemmaId) ?? []
      if (!forms.some((f) => f.tag.includes(` ${GENDER_TAG[gender as 'en' | 'ei' | 'et']} `))) continue
    }
    ids.add(a.lemmaId)
  }
  if (!ids.size) return null
  // Homonyms (bok: "boker" and "bøker") — keep the lemma whose forms are most frequent in speech.
  let best: OrdbankForm[] = []
  let bestScore = -1
  for (const id of ids) {
    const forms = (ob.byLemma.get(id) ?? []).filter((f) => f.pos === want || (pos === 'num' && f.pos === 'det') || want === 'verb')
    const score = [...new Set(forms.map((f) => f.form.toLowerCase()))].reduce((s, f) => s + (freq.get(f) ?? 0), 0)
    if (score > bestScore) {
      best = forms
      bestScore = score
    }
  }
  const out = new Map<string, Set<Feat>>()
  for (const f of best) {
    if (pos === 'noun' && gender === 'en' && f.tag.includes(' fem ')) continue
    const feat = featOf(f.tag)
    if (!feat) continue
    const key = f.form.toLowerCase()
    if (!out.has(key)) out.set(key, new Set())
    out.get(key)!.add(feat)
  }
  return out
}

function pickForm(forms: Map<string, Set<Feat>>, feat: Feat, prefer: RegExp[]): string | undefined {
  const all = [...forms.entries()].filter(([, f]) => f.has(feat)).map(([form]) => form)
  for (const re of prefer) {
    const hit = all.find((f) => re.test(f))
    if (hit) return hit
  }
  return all.sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))[0]
}

function formTable(pos: string, gender: string | undefined, forms: Map<string, Set<Feat>>): FormRow[] {
  const rows: Array<[string, string | undefined]> = []
  if (pos === 'noun') {
    rows.push(
      ['a', pickForm(forms, 'sg', [])],
      ['the', pickForm(forms, 'sg-def', gender === 'ei' ? [/a$/] : [/e[nt]$/])],
      ['several', pickForm(forms, 'pl', [/er$/, /e$/])],
      ['the several', pickForm(forms, 'pl-def', [/ene$/])],
    )
  } else if (pos === 'verb') {
    rows.push(
      ['to', pickForm(forms, 'inf', [])],
      ['now', pickForm(forms, 'pres', [])],
      ['past', pickForm(forms, 'pret', [/et$/, /te$/, /de$/])],
      ['have', pickForm(forms, 'perf', [/et$/, /t$/])],
    )
  } else if (pos === 'adj') {
    rows.push(
      ['en / ei', pickForm(forms, 'base', [])],
      ['et', pickForm(forms, 'neut', [])],
      ['several', pickForm(forms, 'e-form', [])],
    )
  }
  return rows.filter((r): r is [string, string] => !!r[1]).map(([label, form]) => ({ label, form }))
}

// ---------------------------------------------------------------- parsing

interface RawSentence { unit: number; no: string; en: string; plus: string[]; minus: string[]; alts: string[]; where: string }
interface RawStory { unit: number; title: string; titleEn: string; lines: Array<{ who: string; no: string; en: string }>; questions: Quiz[]; glosses: Record<string, string>; where: string }
interface ItemInfo { item: Item; forms: Map<string, Set<Feat>>; exact: boolean; lemma: string }

const units: Unit[] = []
const lessons: Lesson[] = []
const lessonNeeds: string[][] = []
const info = new Map<string, ItemInfo>()
const rawSentences: RawSentence[] = []
const rawStories: RawStory[] = []

const slug = (s: string) => s.toLowerCase().replace(/[^a-zæøå0-9]+/g, '-').replace(/^-|-$/g, '')
const fields = (s: string) => s.split('|').map((x) => x.trim())
const norm = (s: string) => s.toLowerCase().replace(/[.,!?:;"«»()]/g, '').replace(/\s+/g, ' ').trim()

function addItem(item: Item, forms: Map<string, Set<Feat>>, exact: boolean, lemma: string, where: string) {
  if (info.has(item.id)) errors.push(`${where}: duplicate item ${item.id}`)
  info.set(item.id, { item, forms, exact, lemma })
  lessons[item.lesson].items.push(item.id)
}

function parseUnit(file: string) {
  const lines = readFileSync(file, 'utf8').split('\n')
  let unit: Unit | null = null
  let lesson: Lesson | null = null
  let mode: 'lesson' | 'sentences' | 'story' | null = null
  let pattern: Item | null = null
  let story: RawStory | null = null

  lines.forEach((raw, n) => {
    const line = raw.trim()
    const where = `${file.split('/').pop()}:${n + 1}`
    if (!line) return
    if (line.startsWith('# unit')) {
      const [head, name, subtitle] = fields(line.slice(2))
      unit = { index: Number(head.replace('unit', '')), name, subtitle, lessons: [] }
      units.push(unit)
      return
    }
    if (!unit) return
    if (line.startsWith('## lesson')) {
      const [title, needs] = fields(line.slice('## lesson'.length))
      lesson = { index: lessons.length, unit: unit.index, title, items: [], needs: [] }
      lessons.push(lesson)
      lessonNeeds.push(needs?.startsWith('needs:') ? needs.slice(6).split(',').map((x) => x.trim()).filter(Boolean) : [])
      unit.lessons.push(lesson.index)
      mode = 'lesson'
      pattern = null
      return
    }
    if (line.startsWith('## sentences')) {
      mode = 'sentences'
      return
    }
    if (line.startsWith('## story')) {
      const [title, titleEn] = fields(line.slice('## story'.length))
      story = { unit: unit.index, title, titleEn, lines: [], questions: [], glosses: {}, where }
      rawStories.push(story)
      mode = 'story'
      return
    }
    if (line.startsWith('#')) return

    if (mode === 'sentences') {
      if (!line.startsWith('s ')) return errors.push(`${where}: expected a sentence line starting with "s "`)
      const [no, en, ...rest] = fields(line.slice(2))
      if (!no || !en) return errors.push(`${where}: sentence needs Norwegian and English`)
      const s: RawSentence = { unit: unit.index, no, en, plus: [], minus: [], alts: [], where }
      for (const r of rest) {
        if (r.startsWith('alt:')) s.alts.push(...r.slice(4).split(';').map((x) => x.trim()).filter(Boolean))
        else for (const tag of r.split(/\s+/)) {
          if (tag.startsWith('+')) s.plus.push(tag.slice(1))
          else if (tag.startsWith('-')) s.minus.push(tag.slice(1))
          else if (tag) errors.push(`${where}: unknown sentence field "${tag}"`)
        }
      }
      rawSentences.push(s)
      return
    }

    if (mode === 'story' && story) {
      if (line.startsWith('?')) {
        const [prompt, ...options] = fields(line.slice(1))
        const correct = options.find((o) => o.startsWith('*'))
        if (!correct || options.length < 2) return errors.push(`${where}: question needs options, one marked with *`)
        story.questions.push({ prompt, options: [correct.slice(1), ...options.filter((o) => o !== correct)] })
      } else if (line.startsWith('+')) {
        const [word, gloss] = fields(line.slice(1))
        story.glosses[word.toLowerCase()] = gloss
      } else {
        const m = line.match(/^([^:|]{1,12}):\s*(.*)$/)
        const [no, en] = fields(m ? m[2] : line)
        if (!no || !en) return errors.push(`${where}: story line needs Norwegian and English`)
        story.lines.push({ who: m ? m[1] : '', no, en })
      }
      return
    }

    if (mode !== 'lesson' || !lesson) return
    const kind = line.split(' ')[0]
    const body = fields(line.slice(kind.length))

    if (kind === 'rule:' && pattern) return void pattern.rule!.push(line.slice(5).trim())
    if (kind === 'ex:' && pattern) {
      const [no, en] = fields(line.slice(3))
      return void pattern.examples!.push({ no, en } satisfies Example)
    }
    if (kind === 'q:' && pattern) {
      const [prompt, ...options] = fields(line.slice(2))
      const correct = options.find((o) => o.startsWith('*'))
      if (!correct) return errors.push(`${where}: quiz needs one option marked with *`)
      return void pattern.quiz!.push({ prompt, options: [correct.slice(1), ...options.filter((o) => o !== correct)] })
    }

    if (kind === 'p') {
      const [id, title, needs] = body
      pattern = {
        id: `p:${id}`, kind: 'pattern', lesson: lesson.index, text: title, display: title, gloss: title, answers: [],
        title, rule: [], examples: [], quiz: [],
        needs: (needs ?? '').replace('needs:', '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => `p:${x}`),
      }
      addItem(pattern, new Map(), true, '', where)
      return
    }

    if (kind === 'c') {
      const [text, gloss] = body
      if (!text || !gloss) return errors.push(`${where}: chunk needs text and meaning`)
      const answer = norm(text.replace(/___/g, ''))
      addItem(
        { id: `c:${slug(text)}`, kind: 'chunk', lesson: lesson.index, text, display: text, gloss, answers: [answer] },
        new Map(), true, '', where,
      )
      return
    }

    if (kind === 'w' || kind === 'f') {
      const [text, posField, gloss, ...opts] = body
      if (!text || !posField || !gloss) return errors.push(`${where}: word needs text, class and meaning`)
      const [pos, gender] = posField.split(/\s+/)
      const lemma = opts.find((o) => o.startsWith('lemma='))?.slice(6) ?? text
      // Pronouns are taught form by form (jeg and meg are separate items).
      const exact = kind === 'f' || opts.includes('only') || pos === 'pron'
      const all = lemmaForms(lemma, pos, gender)
      if (!all && !['interj', 'other', 'adv'].includes(pos) && gender !== 'pl' && !exact) warnings.push(`${where}: "${lemma}" (${pos}) is not in Norsk Ordbank`)
      let forms = all ?? new Map<string, Set<Feat>>([[text.toLowerCase(), new Set<Feat>(['other'])]])
      if (exact) {
        const own = forms.get(text.toLowerCase())
        if (!own && all) warnings.push(`${where}: "${text}" is not a form of "${lemma}"`)
        // A word marked "only" is taught as a fixed word (penger, mange); an "f" form keeps its grammar (bøker is a plural).
        forms = new Map([[text.toLowerCase(), kind === 'f' && own ? own : new Set<Feat>(['other'])]])
      }
      const p = pron.get(`${text.toLowerCase()}|${UTTALE_POS[pos] ?? ''}`) ?? pron.get(text.toLowerCase())
      if (!p) warnings.push(`${where}: no pronunciation for "${text}"`)

      let display = text
      let answers = [text.toLowerCase()]
      if (pos === 'noun' && !exact && gender && gender !== 'pl') {
        display = `${gender} ${text}`
        answers = gender === 'ei' ? [`ei ${text}`, `en ${text}`] : [`${gender} ${text}`]
      } else if (pos === 'verb' && !exact) {
        display = `å ${text}`
        answers = [text, `å ${text}`]
      }
      addItem(
        {
          id: `w:${text.toLowerCase()}:${pos}`, kind: 'word', lesson: lesson.index, text, display, gloss, answers, pos,
          ...(gender ? { gender: gender as Item['gender'] } : {}),
          ...(p ? { ipa: p.ipa, ...(p.tone ? { tone: p.tone } : {}) } : {}),
          ...(!exact && all ? { forms: formTable(pos, gender, all) } : {}),
        },
        forms, exact, lemma, where,
      )
      return
    }
    errors.push(`${where}: cannot read line "${line}"`)
  })
}

const unitDir = join(ROOT, 'content/units')
for (const f of readdirSync(unitDir).filter((f) => f.endsWith('.txt')).sort()) parseUnit(join(unitDir, f))

const names = new Set(
  readFileSync(join(ROOT, 'content/names.txt'), 'utf8').split('\n').map((s) => s.trim().toLowerCase()).filter(Boolean),
)

// ---------------------------------------------------------------- indexes

interface Cand { id: string; feats: Set<Feat>; exact: boolean; lesson: number; pos: string }
const formIndex = new Map<string, Cand[]>()
for (const [id, { item, forms, exact }] of info) {
  if (item.kind !== 'word') continue
  for (const [form, feats] of forms) {
    if (!formIndex.has(form)) formIndex.set(form, [])
    formIndex.get(form)!.push({ id, feats, exact, lesson: item.lesson, pos: item.pos! })
  }
}
const REFLEXIVES = ['seg', 'meg', 'deg', 'oss', 'dere']
/** Spellings a chunk word may take in a sentence: a verb may be inflected (ha / har / hadde), "seg" may be any reflexive. */
function chunkWordForms(word: string): Set<string> {
  const out = new Set([word])
  if (word === 'seg') for (const r of REFLEXIVES) out.add(r)
  const verb = lemmaForms(word, 'verb')
  if (verb?.get(word)?.has('inf')) for (const [form, feats] of verb) if (!feats.has('imp') || feats.size > 1) out.add(form)
  return out
}
const chunks = [...info.values()]
  .filter((i) => i.item.kind === 'chunk')
  .map((i) => ({
    id: i.item.id,
    size: norm(i.item.text.replace(/___/g, ' ')).split(' ').filter(Boolean).length,
    parts: i.item.text.split('___').map((p) => norm(p).split(' ').filter(Boolean).map(chunkWordForms)),
  }))
  .sort((a, b) => b.size - a.size)

const MODAL_LEMMAS = new Set(['ville', 'kunne', 'måtte', 'skulle', 'burde'])
const POSSESSIVE_LEMMAS = new Set(['min', 'din', 'hans', 'hennes', 'vår', 'deres'])
const OBJECT_PRONOUNS = new Set(['meg', 'deg', 'ham', 'henne', 'oss', 'dem'])
const SUBJECTS = new Set(['jeg', 'du', 'han', 'hun', 'vi', 'dere', 'de', 'det', 'dette'])
const WH = new Set(['hva', 'hvor', 'hvem', 'hvordan', 'når', 'hvorfor', 'hvilken', 'hvilket', 'hvilke'])
const SUB_CONJ = new Set(['at', 'fordi', 'hvis'])
const ARTICLES = new Set(['en', 'ei', 'et'])
const hasPattern = (id: string) => info.has(`p:${id}`)

interface Analysed { tokens: Token[]; patterns: string[]; finite: boolean[] }

function analyse(text: string, where: string, plus: string[], minus: string[], glosses: Record<string, string> = {}, limit = Infinity): Analysed {
  const raw = text.split(/\s+/).filter(Boolean).map((w) => {
    const m = w.match(/^(.*?)\{(\w+)\}(.*)$/)
    const full = m ? m[1] + m[3] : w
    const word = full.replace(/^[.,!?:;"«»()]+|[.,!?:;"«»()]+$/g, '')
    return { t: word, lc: word.toLowerCase(), pick: m?.[2], end: /[.!?:]["»]?$/.test(full) }
  }).filter((r) => r.t)

  const tokens: Token[] = raw.map((r) => ({ t: r.t }))
  const feats: Array<Set<Feat>> = raw.map(() => new Set())
  const lemmaOf: string[] = raw.map(() => '')
  const posOf: string[] = raw.map(() => '')
  const isF: boolean[] = raw.map(() => false)

  // Chunks: longest first, each token belongs to at most one chunk.
  for (const ch of chunks) {
    for (let i = 0; i + ch.parts[0].length <= raw.length; i++) {
      let pos = i
      const covered: number[] = []
      let ok = true
      ch.parts.forEach((part, pi) => {
        if (!ok) return
        if (pi > 0) {
          // The slot takes at least one word; find where the next part begins.
          if (!part.length) return
          let j = pos + 1
          while (j + part.length <= raw.length && !part.every((w, k) => w.has(raw[j + k].lc))) j++
          if (j + part.length > raw.length) return void (ok = false)
          pos = j
        }
        if (!part.every((w, k) => w.has(raw[pos + k]?.lc))) return void (ok = false)
        for (let k = 0; k < part.length; k++) covered.push(pos + k)
        pos += part.length
      })
      if (ok && covered.length && covered.every((k) => !tokens[k].c)) for (const k of covered) tokens[k].c = ch.id
    }
  }

  raw.forEach((r, i) => {
    const tok = tokens[i]
    let cands = formIndex.get(r.lc) ?? []
    // A capitalised name wins over a word with the same spelling (Anna / anna).
    if (names.has(r.lc) && /^[A-ZÆØÅ]/.test(r.t) && i > 0) cands = []
    const taught = cands.filter((c) => c.lesson <= limit)
    if (taught.length) cands = taught
    // An irregular form taught on its own replaces the general entry of the same verb (gikk / gå).
    const lemmaKey = (c: Cand) => info.get(c.id)!.lemma.toLowerCase()
    cands = cands.filter((c) => c.exact || !cands.some((x) => x.exact && lemmaKey(x) === lemmaKey(c)))
    // An uninflected word spelled exactly like this (så, for) ranks before an inflected form of another word.
    const rank = (c: Cand) => (c.feats.has('other') && !c.exact ? -1 : FEAT_ORDER.findIndex((f) => c.feats.has(f)))
    if (r.pick) cands = cands.filter((c) => c.pos === r.pick)
    else if (new Set(cands.map(lemmaKey)).size > 1) {
      // Two different words share this spelling. Inflected readings are ranked (jobber: verb before plural noun);
      // an uninflected one (så, vår) cannot be ranked, so the author must choose.
      if (cands.some((c) => c.feats.has('other')) && cands.some((c) => c.exact && info.get(c.id)!.item.text.toLowerCase() !== info.get(c.id)!.lemma.toLowerCase()) && !tokens[i].c) {
        warnings.push(`${where}: "${r.t}" is ambiguous (${cands.map((c) => c.id).join(', ')}); write ${r.t}{${cands[cands.length - 1].pos}} to choose`)
      }
    }
    const best = [...cands].sort((a, b) => rank(a) - rank(b) || a.lesson - b.lesson)[0]
    if (best) {
      tok.w = best.id
      const entry = info.get(best.id)!
      lemmaOf[i] = entry.lemma
      posOf[i] = best.pos
      isF[i] = entry.exact && entry.lemma.toLowerCase() !== entry.item.text.toLowerCase()
      const least = FEAT_ORDER.find((f) => best.feats.has(f))
      for (const f of best.feats) feats[i].add(f)
      // Other spellings of the same form (boka / boken).
      if (!entry.exact && least) {
        const alts = [...entry.forms.entries()].filter(([form, fs]) => form !== r.lc && [...best.feats].some((f) => fs.has(f)) && fs.has(least)).map(([form]) => form)
        if (alts.length) tok.alts = alts
      }
    } else if (ARTICLES.has(r.lc)) {
      if (r.lc === 'ei') tok.alts = ['en']
    } else if (names.has(r.lc) || /^\d+$/.test(r.lc)) {
      tok.free = true
    } else if (glosses[r.lc]) {
      tok.free = true
    } else if (!tok.c) {
      errors.push(`${where}: "${r.t}" is not a taught word, chunk or name`)
    }
  })

  const isModal = (i: number) => MODAL_LEMMAS.has(lemmaOf[i])
  const finite = raw.map((_, i) => posOf[i] === 'verb' && (isModal(i) || ((feats[i].has('pres') || feats[i].has('pret')) && !feats[i].has('inf') && !feats[i].has('sg'))))

  raw.forEach((r, i) => {
    const p: string[] = []
    const f = feats[i]
    const tok = tokens[i]
    if (ARTICLES.has(r.lc) && !tok.w) p.push('gender')
    if (r.lc === 'ikke') p.push('neg')
    if (tok.w === 'w:å:other') p.push('inf-aa')
    if (posOf[i] === 'verb') {
      if (isModal(i)) {
        p.push('modal')
        if (lemmaOf[i] === 'skulle') p.push('future')
      } else if (f.has('pres') && !f.has('inf')) p.push('present')
      const afterHar = [1, 2, 3].some((d) => ['har', 'hadde'].includes(raw[i - d]?.lc))
      // A verb that opens a sentence and is not followed by its subject is an order: Kom! Vent litt!
      const order = f.has('imp') && (i === 0 || raw[i - 1].end) && !SUBJECTS.has(raw[i + 1]?.lc) && !/\?\s*$/.test(text)
      if (order) p.push('imperative')
      else if (f.has('perf') && afterHar) p.push('perfect')
      else if (f.has('pret') && !f.has('pres') && !f.has('inf') && !isF[i]) p.push('past')
    }
    if (posOf[i] === 'noun' && !f.has('sg')) {
      if (f.has('sg-def')) p.push('definite')
      else if (f.has('pl')) p.push('plural')
      else if (f.has('pl-def')) p.push('plural-def')
    }
    if (posOf[i] === 'adj' && !f.has('base') && (f.has('neut') || f.has('e-form'))) p.push('adj-agree')
    if (posOf[i] === 'det' && POSSESSIVE_LEMMAS.has(lemmaOf[i])) p.push('possessive')
    if (OBJECT_PRONOUNS.has(r.lc)) p.push('obj-pron')
    const kept = p.filter(hasPattern).map((x) => `p:${x}`)
    if (kept.length) tok.p = kept
  })

  const sp = new Set<string>()
  const question = /\?\s*$/.test(text)
  if (question && WH.has(raw[0]?.lc)) sp.add('q-wh')
  else if (question && finite[0]) sp.add('q-yn')
  if (!question && raw.some((_, i) => i >= 1 && finite[i] && SUBJECTS.has(raw[i + 1]?.lc) && !SUB_CONJ.has(raw[i - 1]?.lc))) sp.add('v2')
  if (raw.some((r) => SUB_CONJ.has(r.lc))) sp.add('sub')
  for (const t of plus) {
    if (!hasPattern(t)) errors.push(`${where}: unknown pattern +${t}`)
    sp.add(t)
  }
  for (const t of minus) {
    sp.delete(t)
    for (const tok of tokens) if (tok.p) tok.p = tok.p.filter((x) => x !== `p:${t}`)
  }
  return { tokens, patterns: [...sp].filter(hasPattern).map((x) => `p:${x}`), finite }
}

/** The lesson after which every item of this text has been taught. */
function readyAt(a: Analysed): number {
  const L = (id: string) => info.get(id)!.item.lesson
  let max = 0
  let allChunk = true
  for (const t of a.tokens) {
    if (t.free) continue
    const viaWord = t.w ? Math.max(L(t.w), ...(t.p ?? []).map(L)) : t.p?.length ? Math.max(...t.p.map(L)) : Infinity
    const viaChunk = t.c ? L(t.c) : Infinity
    if (viaChunk > viaWord || !t.c) allChunk = false
    max = Math.max(max, Math.min(viaWord, viaChunk))
  }
  if (!allChunk && a.patterns.length) max = Math.max(max, ...a.patterns.map(L))
  return max
}

// ---------------------------------------------------------------- lessons

const patternLesson = (id: string) => info.get(id)?.item.lesson
lessons.forEach((lesson, i) => {
  const needs = new Set<number>()
  for (const n of lessonNeeds[i]) {
    const byPattern = patternLesson(`p:${n}`)
    const byTitle = lessons.find((l) => l.title.toLowerCase() === n.toLowerCase())?.index
    const hit = byPattern ?? byTitle
    if (hit === undefined) errors.push(`lesson "${lesson.title}": unknown need "${n}"`)
    else needs.add(hit)
  }
  const patterns = lesson.items.map((id) => info.get(id)!.item).filter((it) => it.kind === 'pattern')
  for (const p of patterns) {
    for (const need of p.needs ?? []) {
      const l = patternLesson(need)
      if (l === undefined) errors.push(`pattern ${p.id}: unknown need ${need}`)
      else if (l !== i) needs.add(l)
    }
    // A pattern's examples may only use words that are already taught.
    for (const ex of [...(p.examples ?? []).map((e) => e.no), ...(p.quiz ?? []).map((q) => q.prompt)]) {
      for (const part of ex.split('>')) {
        const a = analyse(part.replace(/^å /, ''), `pattern ${p.id} example "${ex}"`, [], [], {}, i)
        for (const t of a.tokens) {
          if (t.c && info.get(t.c)!.item.lesson <= i) continue
          const l = t.w ? info.get(t.w)!.item.lesson : undefined
          if (l !== undefined && l > i) errors.push(`pattern ${p.id}: example "${ex}" uses "${t.t}", which is taught later`)
          else if (l !== undefined && l < i) needs.add(l)
        }
      }
    }
  }
  if (!lessonNeeds[i].length && i > 0) {
    // By default a lesson follows the nearest earlier lesson that teaches a pattern.
    let j = i - 1
    while (j > 0 && !lessons[j].items.some((id) => id.startsWith('p:'))) j--
    needs.add(patterns.length ? i - 1 : j)
  }
  // Drop needs already implied by another need.
  const reach = (from: number, seen = new Set<number>()): Set<number> => {
    for (const n of lessons[from].needs) if (!seen.has(n)) reach(n, seen.add(n))
    return seen
  }
  const direct = [...needs].filter((n) => n < i)
  lesson.needs = direct.filter((n) => !direct.some((m) => m !== n && reach(m).has(n))).sort((a, b) => a - b)
})

// ---------------------------------------------------------------- sentences and stories

const sentences: Sentence[] = []
const unitEnd = (u: number) => Math.max(...units.find((x) => x.index === u)!.lessons)
const seen = new Set<string>()
const usage = new Map<string, number>()

for (const s of rawSentences) {
  const a = analyse(s.no, s.where, s.plus, s.minus, {}, unitEnd(s.unit))
  const key = norm(s.no)
  if (seen.has(key)) {
    warnings.push(`${s.where}: duplicate sentence`)
    continue
  }
  seen.add(key)
  const ready = readyAt(a)
  if (ready > unitEnd(s.unit)) {
    const late = a.tokens.flatMap((t) => [t.w, ...(t.p ?? [])]).concat(a.patterns).filter((id): id is string => !!id && info.get(id)!.item.lesson > unitEnd(s.unit))
    errors.push(`${s.where}: uses items taught after unit ${s.unit}: ${[...new Set(late)].join(', ')}`)
    continue
  }
  for (const id of new Set(a.tokens.flatMap((t) => [t.w, t.c, ...(t.p ?? [])]).concat(a.patterns))) if (id) usage.set(id, (usage.get(id) ?? 0) + 1)
  sentences.push({
    id: `s${s.unit}-${slug(s.no).slice(0, 40)}`, unit: s.unit, no: s.no.replace(/\{\w+\}/g, ''), en: s.en,
    tokens: a.tokens, patterns: a.patterns, alts: s.alts,
  })
}

const stories: Story[] = rawStories.map((st, i) => {
  const lines = st.lines.map((l) => {
    const a = analyse(l.no, `${st.where} "${l.no}"`, [], [], st.glosses, unitEnd(st.unit))
    if (readyAt(a) > unitEnd(st.unit)) errors.push(`${st.where}: line "${l.no}" uses items taught after unit ${st.unit}`)
    return { ...l, no: l.no.replace(/\{\w+\}/g, ''), tokens: a.tokens }
  })
  const words = lines.flatMap((l) => l.tokens)
  const unknown = new Set(words.map((t) => t.t.toLowerCase()).filter((w) => st.glosses[w])).size
  if (words.length && unknown / words.length > 0.05) warnings.push(`${st.where}: ${Math.round((unknown / words.length) * 100)}% of the words are new (limit 5%)`)
  if (st.questions.length < 2) warnings.push(`${st.where}: story has fewer than 2 questions`)
  return { id: `st${st.unit}-${i}`, unit: st.unit, title: st.title, titleEn: st.titleEn, lines, questions: st.questions, glosses: st.glosses }
})

// ---------------------------------------------------------------- sounds

const sounds: SoundPair[] = []
{
  const groups = new Map<string, { title: string; hint: string }>()
  for (const line of readFileSync(join(ROOT, 'content/sounds.txt'), 'utf8').split('\n')) {
    if (line.startsWith('group ')) {
      const [id, title, hint] = fields(line.slice(6))
      groups.set(id, { title, hint })
    } else if (line.startsWith('pair ')) {
      const [group, a, ag, b, bg] = fields(line.slice(5))
      const g = groups.get(group)
      if (!g) errors.push(`sounds.txt: unknown group ${group}`)
      else sounds.push({ id: `${group}:${a}-${b}`, group, groupTitle: g.title, hint: g.hint, a: { word: a, gloss: ag }, b: { word: b, gloss: bg } })
    }
  }
}

// ---------------------------------------------------------------- report and output

const reportUnit = process.argv.includes('--unit') ? Number(process.argv[process.argv.indexOf('--unit') + 1]) : null
if (reportUnit !== null) {
  const end = unitEnd(reportUnit)
  const inUnit = [...info.values()].filter((i) => lessons[i.item.lesson].unit === reportUnit)
  console.log(`\nUnit ${reportUnit}: ${sentences.filter((s) => s.unit === reportUnit).length} sentences, ${stories.filter((s) => s.unit === reportUnit).length} stories`)
  const thin = inUnit.filter((i) => (usage.get(i.item.id) ?? 0) < 3).map((i) => `${i.item.id} (${usage.get(i.item.id) ?? 0})`)
  if (thin.length) console.log(`Items of this unit used in fewer than 3 sentences:\n  ${thin.join('\n  ')}`)
  void end
}

mkdirSync(join(ROOT, 'data/build'), { recursive: true })
for (const u of units) {
  const upTo = [...info.values()].filter((i) => lessons[i.item.lesson].unit <= u.index)
  const lines = upTo.map(({ item, forms, exact }) => {
    const all = item.kind === 'word' && !exact ? ` | forms: ${[...forms.keys()].join(', ')}` : ''
    return `${lessons[item.lesson].unit}\t${item.id}\t${item.display}\t${item.gloss}${all}`
  })
  writeFileSync(join(ROOT, `data/build/vocab-u${String(u.index).padStart(2, '0')}.tsv`), lines.join('\n') + '\n')
}

for (const w of warnings) console.log(`warning: ${w}`)
for (const e of errors) console.log(`ERROR: ${e}`)

const items: Record<string, Item> = {}
for (const [id, { item }] of info) items[id] = item
const curriculum: Curriculum = { units, lessons, items, sentences, stories, sounds }
const counts = { words: 0, chunks: 0, patterns: 0 }
for (const it of Object.values(items)) counts[it.kind === 'word' ? 'words' : it.kind === 'chunk' ? 'chunks' : 'patterns']++
console.log(`\n${units.length} units, ${lessons.length} lessons, ${counts.words} words, ${counts.chunks} chunks, ${counts.patterns} patterns, ${sentences.length} sentences, ${stories.length} stories, ${sounds.length} sound pairs`)
console.log(`${errors.length} errors, ${warnings.length} warnings`)

if (errors.length && !process.argv.includes('--force')) process.exit(1)
writeFileSync(join(ROOT, 'src/content/curriculum.json'), JSON.stringify(curriculum))
console.log('wrote src/content/curriculum.json')
