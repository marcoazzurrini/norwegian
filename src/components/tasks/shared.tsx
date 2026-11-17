import { useEffect, useMemo, useState } from 'react'
import { items } from '../../content'
import type { Item, Quiz } from '../../content/types'

export interface Frame {
  label: string
  progress: number
  onClose: () => void
}

/** What a finished task reports back to the session. */
export interface TaskResult {
  itemIds: string[]
  right: number
  wrong: number
  taught: number
}

export const EMPTY_RESULT: TaskResult = { itemIds: [], right: 0, wrong: 0, taught: 0 }

export function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Short English description of what a pattern or word is, for hints and lists. */
export const nameOf = (it: Item) => (it.kind === 'pattern' ? it.title! : `${it.text.replace(/\s*___\s*/g, ' … ').trim()} (${it.gloss})`)

export const itemName = (id: string) => nameOf(items[id])

interface ChoicesProps {
  quiz: Quiz
  onRight: () => void
  /** Larger option text, for Norwegian options. */
  big?: boolean
}

/** Multiple choice. A wrong pick is marked and the learner tries again; nothing is recorded. */
export function Choices({ quiz, onRight, big }: ChoicesProps) {
  const options = useMemo(() => shuffle(quiz.options), [quiz])
  const [wrong, setWrong] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const pick = (o: string) => {
    if (done) return
    if (o === quiz.options[0]) {
      setDone(true)
      setTimeout(onRight, 450)
    } else setWrong((w) => [...w, o])
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= options.length) pick(options[n - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex flex-col gap-3">
      {options.map((o, i) => {
        const isRight = done && o === quiz.options[0]
        const isWrong = wrong.includes(o)
        return (
          <button
            key={o}
            type="button"
            disabled={isWrong}
            onClick={() => pick(o)}
            className={`flex items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left ${big ? 'text-2xl' : 'text-xl'} ${
              isRight ? 'border-moss bg-moss-soft text-moss' : isWrong ? 'border-lingon bg-lingon-soft text-lingon line-through' : 'border-line bg-surface text-ink'
            }`}
          >
            <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line text-sm text-muted sm:flex">{i + 1}</span>
            {o}
          </button>
        )
      })}
    </div>
  )
}
