import { Check, CircleAlert, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { items } from '../../content'
import type { Sentence } from '../../content/types'
import { gradeSentence, type SentenceGrade } from '../../engine/grade'
import { exercised } from '../../engine/select'
import { applyReviews, getState, updateMeta, type ReviewInput } from '../../engine/store'
import { useExplain, type ExplainRequest } from '../../lib/explain'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { DockRow, Focus } from '../Focus'
import { AudioButton, Button } from '../ui'
import { AiNote, Answer, Ask, Remark, Stamp, itemName, type Frame, type TaskResult } from './shared'

/** Items behind the words the learner got wrong on the first try. */
function failedItems(s: Sentence, g: SentenceGrade): Set<string> {
  const out = new Set<string>()
  for (const i of g.missed) {
    const t = s.tokens[i]
    if (t.w) out.add(t.w)
    else if (t.c) out.add(t.c)
    for (const p of t.p ?? []) out.add(p)
  }
  // Right words in the wrong order: the word-order patterns failed, not the words.
  if (g.orderOnly) {
    out.clear()
    for (const p of s.patterns) out.add(p)
  }
  return out
}

/** A prompt that points at the problem without giving the answer. */
function hintFor(s: Sentence, g: SentenceGrade): string {
  if (g.orderOnly) {
    const p = s.patterns.find((id) => getState().memory.has(id))
    return p ? `All the words are right. Check the order: ${items[p].title}.` : 'All the words are right. Check the order.'
  }
  if (!g.missed.length) return 'There is a word too many.'
  const t = s.tokens[g.missed[0]]
  const pattern = t.p?.find((id) => getState().memory.has(id))
  if (pattern && t.w && g.typed.some((w) => !w.ok)) return `Think about: ${items[pattern].title}.`
  if (t.w) return `Check the word for “${items[t.w].gloss}”.`
  if (pattern) return `Think about: ${items[pattern].title}.`
  if (t.c) return `Check the phrase for “${items[t.c].gloss}”.`
  return 'One word is missing or wrong.'
}

interface Props {
  sentence: Sentence
  frame: Frame
  /** The line above the exchange. */
  stamp?: string
  onDone: (result: TaskResult) => void
}

type Phase = { step: 'ask' } | { step: 'retry'; first: SentenceGrade } | { step: 'result'; passed: boolean; failed: Set<string>; last: SentenceGrade }

/** A whole sentence: English shown, Norwegian typed. One sentence reviews every item in it. */
export function SentenceTask({ sentence, frame, stamp = 'Say it in Norwegian', onDone }: Props) {
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>({ step: 'ask' })
  const covered = useMemo(() => exercised(sentence, getState().memory), [sentence])

  const finish = (failed: Set<string>, last: SentenceGrade, passed: boolean) => {
    setPhase({ step: 'result', passed, failed, last })
    void speak(sentence.no)
  }

  const check = () => {
    const g = gradeSentence(sentence, input)
    setInput('')
    if (phase.step === 'ask') {
      if (g.correct) finish(new Set(), g, true)
      else setPhase({ step: 'retry', first: g })
    } else if (phase.step === 'retry') {
      finish(failedItems(sentence, phase.first), g, g.correct)
    }
  }

  const done = async (failed: Set<string>) => {
    const reviews: ReviewInput[] = covered.map((id) => ({ id, grade: failed.has(id) ? 'again' : 'good', carrier: true }))
    await applyReviews(reviews)
    await updateMeta({ sentenceSeen: { ...getState().meta.sentenceSeen, [sentence.id]: Date.now() } })
    const wrong = covered.filter((id) => failed.has(id)).length
    onDone({ itemIds: covered, right: covered.length - wrong, wrong, taught: 0 })
  }

  const shown = phase.step === 'retry' ? phase.first : phase.step === 'result' ? phase.last : null

  // The app has already decided right and wrong. The language model only adds words about the mistake.
  const ask: ExplainRequest | null = useMemo(() => {
    const words = (g: SentenceGrade) => g.typed.map((w) => w.word).join(' ')
    if (phase.step === 'retry') return { kind: 'hint', en: sentence.en, no: sentence.no, answer: words(phase.first), topics: [...failedItems(sentence, phase.first)].map(itemName) }
    if (phase.step === 'result' && phase.failed.size > 0) return { kind: 'explain', en: sentence.en, no: sentence.no, answer: words(phase.last), topics: [...phase.failed].map(itemName) }
    return null
  }, [phase, sentence])
  const aiText = useExplain(ask)

  return (
    <Focus
      {...frame}
      scrollKey={`${phase.step}-${aiText ? 1 : 0}`}
      dock={
        phase.step === 'result' ? (
          <DockRow>
            {phase.failed.size > 0 ? (
              <Button variant="secondary" onClick={() => void done(new Set())}>
                It was a typo
              </Button>
            ) : (
              <span />
            )}
            <Button key="continue" autoFocus onClick={() => void done(phase.failed)} hint="↵">
              Continue
            </Button>
          </DockRow>
        ) : (
          <AnswerInput key={phase.step} value={input} onChange={setInput} onSubmit={check} placeholder={phase.step === 'retry' ? 'Try again' : 'Type in Norwegian'} />
        )
      }
    >
      <Stamp>{stamp}</Stamp>
      <Ask>{sentence.en}</Ask>

      {shown && (
        <div key={phase.step} className="rise flex flex-wrap justify-end gap-1.5 self-end lg:gap-2">
          {shown.typed.map((w, i) => (
            <span
              key={i}
              className={`inline-flex h-[2.875rem] items-center gap-1.5 rounded-2xl bg-inverse pr-3 pl-4 text-24 font-medium tracking-[-0.02em] text-on-inverse lg:h-[4.5rem] lg:gap-2.5 lg:rounded-3xl lg:pr-[1.375rem] lg:pl-[1.625rem] lg:text-40 ${
                w.ok ? '' : 'shadow-[inset_0_0_0_2px_var(--color-red)] lg:shadow-[inset_0_0_0_3px_var(--color-red)]'
              }`}
            >
              {w.word}
              {w.ok ? <Check className="size-4 text-green-ink lg:size-[1.375rem]" aria-label="right" /> : <X className="size-4 text-red-ink lg:size-[1.375rem]" aria-label="wrong" />}
            </span>
          ))}
        </div>
      )}

      {phase.step === 'retry' && (
        <>
          <Remark className="mt-1 lg:mt-2.5" lead={phase.first.missed.length + phase.first.typed.filter((t) => !t.ok).length <= 2 ? 'Almost.' : 'Not yet.'}>
            {hintFor(sentence, phase.first)}
          </Remark>
          {aiText && <AiNote label="Hint">{aiText}</AiNote>}
          <Button variant="outline" size="medium" className="rise self-start" onClick={() => finish(failedItems(sentence, phase.first), phase.first, false)}>
            Show answer
          </Button>
        </>
      )}

      {phase.step === 'result' && (
        <>
          <Answer
            audio={<AudioButton text={sentence.no} className="size-12 lg:size-[3.75rem]" />}
            good={phase.passed}
            note={phase.failed.size === 0 ? 'Correct.' : phase.passed ? 'Correct on the second try.' : 'This is the answer.'}
          >
            {sentence.no}
          </Answer>
          {aiText && <AiNote label="Explanation">{aiText}</AiNote>}
          {covered.length > 0 && (
            <div className="rise flex flex-col self-stretch rounded-[1.25rem] border border-line bg-inset px-4 py-3.5 lg:rounded-[1.625rem] lg:px-7 lg:py-[1.375rem]">
              <div className="flex justify-between gap-3 pb-2 lg:pb-3">
                <span className="text-15 font-medium lg:text-18">
                  This sentence reviews {covered.length} {covered.length === 1 ? 'item' : 'items'}
                </span>
                {phase.failed.size > 0 && <span className="shrink-0 text-14 text-fg2 lg:text-16">{covered.filter((id) => phase.failed.has(id)).length} to repeat</span>}
              </div>
              {covered.map((id) => {
                const bad = phase.failed.has(id)
                return (
                  <div key={id} className="flex items-center gap-3 border-t border-line py-2 text-15 lg:py-[0.6875rem] lg:text-18">
                    {bad ? <CircleAlert className="size-[1.125rem] shrink-0 text-red" /> : <Check className="size-[1.125rem] shrink-0 text-green" />}
                    <span className="flex-1">{itemName(id)}</span>
                    <span className="text-14 text-fg2">{bad ? 'needs work' : 'reviewed'}</span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </Focus>
  )
}
