import { Check, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { items } from '../../content'
import type { Item, Quiz } from '../../content/types'
import { Key, type BlobKind } from '../ui'

/** What every task screen shows around the task itself. */
export interface Frame {
  block: BlobKind
  title: string
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

/** True if the item is shown with an article in front, such as "et hus". */
export const hasArticle = (it: Item) => it.pos === 'noun' && it.display.includes(' ')

/** The small centred line that says where you are in a task. */
export function Stamp({ children }: { children: ReactNode }) {
  return <div className="self-center pb-1.5 text-13 font-medium text-fg3 lg:pb-2.5 lg:text-15">{children}</div>
}

/** What the app asks: a grey bubble on the left, with the thing to translate in large type. */
export function Ask({ note, children }: { note?: string; children: ReactNode }) {
  return (
    <div className="max-w-full self-start rounded-[1.25rem] bg-raised px-[1.125rem] py-3 lg:rounded-[1.75rem] lg:px-7 lg:py-[1.125rem]">
      {note && <div className="pb-0.5 text-13 text-fg2 lg:text-16">{note}</div>}
      <div className="text-26 leading-[1.1] font-medium tracking-[-0.03em] lg:text-44">{children}</div>
    </div>
  )
}

/** What the learner typed: a white bubble on the right. */
export function Mine({ children }: { children: ReactNode }) {
  return <div className="rise max-w-full self-end rounded-[1.25rem] bg-inverse px-[1.125rem] py-3 text-26 leading-[1.1] font-medium tracking-[-0.03em] break-words text-on-inverse lg:rounded-[1.75rem] lg:px-7 lg:py-[1.125rem] lg:text-44">{children}</div>
}

/** A short remark from the app: a strong lead and a quieter rest. */
export function Remark({ lead, children, center, className = '' }: { lead: string; children?: ReactNode; center?: boolean; className?: string }) {
  return (
    <div className={`rise max-w-full rounded-[1.125rem] bg-raised px-4 py-[0.6875rem] text-16 lg:max-w-[45rem] lg:rounded-[1.375rem] lg:px-5 lg:py-3.5 lg:text-18 ${center ? 'self-center' : 'self-start'} ${className}`} role="status">
      <span className="font-medium">{lead} </span>
      <span className="text-fg2">{children}</span>
    </div>
  )
}

/** Text written by the language model. It is labelled, so it is never mistaken for the app's own checking. */
export function AiNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rise flex max-w-full flex-col gap-1.5 self-start rounded-[1.375rem] bg-raised px-[1.125rem] py-3.5 lg:max-w-[45rem] lg:gap-2 lg:rounded-[1.75rem] lg:px-7 lg:py-5" role="status">
      <div className="flex items-center gap-2 text-13 font-medium text-violet lg:text-15">
        <Sparkles className="size-3.5 lg:size-4" />
        {label}
        <span className="font-normal text-fg3">· written by AI</span>
      </div>
      <div className="text-16 lg:text-20">{children}</div>
    </div>
  )
}

/** The answer after a task: audio, the Norwegian, and a line on how it went. */
export function Answer({ audio, good, note, children }: { audio: ReactNode; good?: boolean; note: string; children: ReactNode }) {
  return (
    <div className="rise flex items-center gap-3.5 self-stretch rounded-[1.25rem] border border-line bg-inset p-[1.125rem] lg:gap-5 lg:rounded-[1.625rem] lg:p-7">
      {audio}
      <div className="min-w-0">
        <div className="text-26 leading-[1.1] font-medium tracking-[-0.03em] break-words lg:text-44">{children}</div>
        <div className="flex items-center gap-2 pt-1 text-15 text-fg2 lg:text-18">
          {good && <Check className="size-4 shrink-0 text-green lg:size-[1.125rem]" />}
          {note}
        </div>
      </div>
    </div>
  )
}

interface ChoicesProps {
  quiz: Quiz
  onRight: () => void
  /** Called with the option when the learner picks a wrong one. */
  onWrong?: (option: string) => void
}

/** Multiple choice. A wrong pick is marked and the learner tries again; nothing is recorded. */
export function Choices({ quiz, onRight, onWrong }: ChoicesProps) {
  const options = useMemo(() => shuffle(quiz.options), [quiz])
  const [wrong, setWrong] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const pick = (o: string) => {
    if (done || wrong.includes(o)) return
    if (o === quiz.options[0]) {
      setDone(true)
      setTimeout(onRight, 450)
    } else {
      setWrong((w) => [...w, o])
      onWrong?.(o)
    }
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
    <div className="flex flex-col gap-2 pt-2 lg:gap-3 lg:pt-4">
      {options.map((o, i) => {
        const isRight = done && o === quiz.options[0]
        const isWrong = wrong.includes(o)
        return (
          <button
            key={o}
            type="button"
            disabled={isWrong}
            onClick={() => pick(o)}
            className={`press flex min-h-[3.75rem] w-full items-center gap-3.5 rounded-[1.125rem] border border-line bg-inset py-3 pr-5 pl-4 text-left text-18 font-medium lg:min-h-20 lg:gap-[1.125rem] lg:rounded-3xl lg:pr-7 lg:pl-[1.375rem] lg:text-24 ${
              isRight ? 'shadow-[inset_0_0_0_1.5px_var(--color-green)]' : isWrong ? 'text-fg3 shadow-[inset_0_0_0_1.5px_var(--color-red)]' : ''
            }`}
          >
            <Key>{i + 1}</Key>
            <span className={`flex-1 ${isWrong ? 'line-through' : ''}`}>{o}</span>
            {isRight && <Check className="size-5 shrink-0 text-green" aria-label="right" />}
            {isWrong && <X className="size-5 shrink-0 text-red" aria-label="wrong" />}
          </button>
        )
      })}
    </div>
  )
}
