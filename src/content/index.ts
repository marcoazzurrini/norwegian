import data from './curriculum.json'
import type { Curriculum, Item, Lesson, Sentence, Story } from './types'

export const curriculum = data as unknown as Curriculum

export const items = curriculum.items
export const lessons = curriculum.lessons
export const units = curriculum.units
export const sentences = curriculum.sentences
export const stories = curriculum.stories
export const sounds = curriculum.sounds

export const item = (id: string): Item => items[id]
export const lessonOf = (id: string): Lesson => lessons[items[id].lesson]

/** Lessons that list this lesson as a need. */
export const unlockedBy = (index: number): Lesson[] => lessons.filter((l) => l.needs.includes(index))

/** Every item a sentence can exercise: words, chunks and patterns. */
export function sentenceItems(s: Sentence): string[] {
  const out = new Set<string>(s.patterns)
  for (const t of s.tokens) {
    if (t.w) out.add(t.w)
    if (t.c) out.add(t.c)
    for (const p of t.p ?? []) out.add(p)
  }
  return [...out]
}

const bySentenceItem = new Map<string, Sentence[]>()
for (const s of sentences) {
  for (const id of sentenceItems(s)) {
    if (!bySentenceItem.has(id)) bySentenceItem.set(id, [])
    bySentenceItem.get(id)!.push(s)
  }
}
export const sentencesWith = (id: string): Sentence[] => bySentenceItem.get(id) ?? []

export const storyById = (id: string): Story | undefined => stories.find((s) => s.id === id)
