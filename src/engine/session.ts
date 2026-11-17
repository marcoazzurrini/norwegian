// A study session: decides, one task at a time, what to do with the minutes the learner chose.
// Order of priority (docs/spec.md, section 3): sounds, items still being learned,
// due reviews, new material, then a story.
import { items, sounds } from '../content'
import type { Item, Sentence, SoundPair, Story } from '../content/types'
import { isLearning } from './memory'
import { dueItems, nextLesson, nextNewItem, nextStory, pickReview, practiceFor, type Memory } from './select'

export type Task =
  | { type: 'sound'; pair: SoundPair; target: 'a' | 'b'; index: number; total: number }
  | { type: 'intro'; item: Item }
  | { type: 'pattern'; item: Item; practice: Sentence[] }
  | { type: 'card'; item: Item; reason: 'learning' | 'review' }
  | { type: 'sentence'; sentence: Sentence; covers: string[] }
  | { type: 'story'; story: Story }
  | { type: 'done' }

export type Block = 'sounds' | 'review' | 'new' | 'story'

export interface SessionView {
  memory: Memory
  storiesDone: ReadonlySet<string>
  chosenLesson: number | null
  soundStats: Record<string, { right: number; total: number }>
}

/** Share of the session that reviews may take while new material is still waiting. */
const REVIEW_SHARE = 0.6
/** With this many reviews due, the session teaches nothing new. */
const BACKLOG = 40
/** A story is offered once this share of the session has passed. */
const STORY_AFTER = 0.7
const MIN_MINUTES_FOR_EXTRAS = 15

export class Session {
  readonly budgetMs: number
  elapsedMs = 0
  private reviewMs = 0
  private soundsLeft: number
  private readonly soundsTotal: number
  private storyOffered = false
  private usedSentences = new Set<string>()
  private recent: string[] = []
  readonly stats = { reviewed: 0, taught: 0, right: 0, wrong: 0 }

  constructor(
    readonly minutes: number,
    private rng: () => number = Math.random,
  ) {
    this.budgetMs = minutes * 60_000
    this.soundsTotal = minutes >= 40 ? 10 : minutes >= 25 ? 8 : minutes >= MIN_MINUTES_FOR_EXTRAS ? 6 : 0
    this.soundsLeft = this.soundsTotal
  }

  get progress(): number {
    return Math.min(1, this.elapsedMs / this.budgetMs)
  }

  /** Call after each task with the time it took and the block it belonged to. */
  record(ms: number, block: Block, itemIds: string[] = []) {
    this.elapsedMs += ms
    if (block === 'review') this.reviewMs += ms
    this.recent = [...itemIds, ...this.recent].slice(0, 3)
  }

  next(view: SessionView, now: number): Task {
    const { memory } = view
    if (this.elapsedMs >= this.budgetMs) return { type: 'done' }

    if (this.soundsLeft > 0) {
      const index = this.soundsTotal - this.soundsLeft
      this.soundsLeft--
      return { type: 'sound', pair: this.pickSound(view), target: this.rng() < 0.5 ? 'a' : 'b', index, total: this.soundsTotal }
    }

    // Items in their first minutes come back as soon as they are due, but not twice in a row.
    const due = dueItems(memory, now)
    const learning = due.learning.find((m) => !this.recent.includes(m.id) && items[m.id].kind !== 'pattern')
    if (learning) return { type: 'card', item: items[learning.id], reason: 'learning' }

    const lesson = due.review.length >= BACKLOG ? null : nextLesson(memory, view.chosenLesson)
    const story = this.minutes >= MIN_MINUTES_FOR_EXTRAS && !this.storyOffered ? nextStory(memory, view.storiesDone) : null

    if (story && this.elapsedMs >= this.budgetMs * STORY_AFTER) return this.offer(story)

    if (due.review.length && (!lesson || this.reviewMs < this.budgetMs * REVIEW_SHARE)) {
      const pick = pickReview(memory, now, this.usedSentences, new Set(this.recent))
      if (pick?.type === 'sentence') {
        this.usedSentences.add(pick.sentence.id)
        return { type: 'sentence', sentence: pick.sentence, covers: pick.covers }
      }
      if (pick) return { type: 'card', item: pick.item, reason: 'review' }
    }

    if (lesson) {
      const it = nextNewItem(lesson, memory)
      if (it) {
        return it.kind === 'pattern' ? { type: 'pattern', item: it, practice: practiceFor(it.id, memory, 3) } : { type: 'intro', item: it }
      }
    }

    if (story) return this.offer(story)

    // Nothing else to do: bring back an item that is still being learned, even if it is a little early.
    const waiting = [...memory.values()]
      .filter((m) => isLearning(m) && items[m.id].kind !== 'pattern' && !this.recent.slice(0, 1).includes(m.id))
      .sort((a, b) => new Date(a.card.dueAt).getTime() - new Date(b.card.dueAt).getTime())[0]
    if (waiting && new Date(waiting.card.dueAt).getTime() - now < 3 * 60_000) return { type: 'card', item: items[waiting.id], reason: 'learning' }

    return { type: 'done' }
  }

  private offer(story: Story): Task {
    this.storyOffered = true
    return { type: 'story', story }
  }

  /** Favours the sound contrasts the learner gets wrong most often. */
  private pickSound(view: SessionView): SoundPair {
    const weight = (p: SoundPair) => {
      const s = view.soundStats[p.group]
      return s && s.total >= 4 ? 1.2 - s.right / s.total : 1
    }
    const total = sounds.reduce((sum, p) => sum + weight(p), 0)
    let r = this.rng() * total
    for (const p of sounds) {
      r -= weight(p)
      if (r <= 0) return p
    }
    return sounds[0]
  }
}

export const blockOf = (task: Task): Block =>
  task.type === 'sound' ? 'sounds' : task.type === 'story' ? 'story' : task.type === 'intro' || task.type === 'pattern' ? 'new' : 'review'
