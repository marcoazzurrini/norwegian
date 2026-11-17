import { Check, CircleAlert, CircleCheck, MessageCircleQuestion, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { items } from '../../content'
import type { Sentence } from '../../content/types'
import { gradeSentence, type SentenceGrade } from '../../engine/grade'
import { exercised } from '../../engine/select'
import { applyReviews, getState, updateMeta, type ReviewInput } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Note } from '../ui'
import { itemName, type Frame, type TaskResult } from './shared'

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
  onDone: (result: TaskResult) => void
}

type Phase = { step: 'ask' } | { step: 'retry'; first: SentenceGrade } | { step: 'result'; passed: boolean; failed: Set<string>; last: SentenceGrade }

export function SentenceTask({ sentence, frame, onDone }: Props) {
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>({ step: 'ask' })
  const covered = useMemo(() => exercised(sentence, getState().memory), [sentence])

  const finish = async (failed: Set<string>, last: SentenceGrade, passed: boolean) => {
    setPhase({ step: 'result', passed, failed, last })
    void speak(sentence.no)
  }

  const check = () => {
    const g = gradeSentence(sentence, input)
    if (phase.step === 'ask') {
      if (g.correct) void finish(new Set(), g, true)
      else setPhase({ step: 'retry', first: g })
    } else if (phase.step === 'retry') {
      void finish(failedItems(sentence, phase.first), g, g.correct)
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

  return (
    <Focus
      {...frame}
      footer={
        phase.step === 'result' ? (
          <>
            {phase.failed.size > 0 ? (
              <Button variant="secondary" onClick={() => void done(new Set())}>
                It was a typo
              </Button>
            ) : (
              <span />
            )}
            <Button key="continue" autoFocus onClick={() => void done(phase.failed)} hint="Enter">
              Continue
            </Button>
          </>
        ) : (
          <>
            {phase.step === 'retry' ? (
              <Button variant="secondary" onClick={() => void finish(failedItems(sentence, phase.first), phase.first, false)}>
                Show answer
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={check} disabled={!input.trim()} hint="Enter">
              {phase.step === 'retry' ? 'Try again' : 'Check'}
            </Button>
          </>
        )
      }
    >
      <div>
        <div className="font-bold text-muted">Say it in Norwegian</div>
        <div className="mt-1.5 text-3xl leading-tight font-bold sm:text-4xl">{sentence.en}</div>
      </div>

      {phase.step !== 'result' && <AnswerInput value={input} onChange={setInput} onSubmit={check} />}

      {shown && !shown.correct && (
        <Card>
          <div className="mb-3 font-bold text-muted">Your answer</div>
          <div className="flex flex-wrap gap-2.5">
            {shown.typed.map((w, i) => (
              <span
                key={i}
                className={`inline-flex items-center gap-2 rounded-xl border-2 px-3.5 py-1.5 text-2xl font-bold ${
                  w.ok ? 'border-transparent bg-moss-soft text-moss' : 'border-lingon bg-lingon-soft text-lingon'
                }`}
              >
                {w.word}
                {w.ok ? <Check size={20} aria-label="right" /> : <X size={20} aria-label="wrong" />}
              </span>
            ))}
          </div>
        </Card>
      )}

      {phase.step === 'retry' && (
        <Note tone="lingon" icon={<MessageCircleQuestion size={22} />} title={phase.first.missed.length + phase.first.typed.filter((t) => !t.ok).length <= 2 ? 'Almost.' : 'Not yet.'}>
          {hintFor(sentence, phase.first)}
        </Note>
      )}

      {phase.step === 'result' && (
        <>
          <Card className={phase.passed && !phase.failed.size ? '!border-moss' : ''}>
            <div className="flex items-center gap-4">
              <AudioButton text={sentence.no} size={48} />
              <div>
                <div className="text-2xl font-bold">{sentence.no}</div>
                <div className="text-muted">{phase.failed.size === 0 ? 'Correct.' : phase.passed ? 'Correct on the second try.' : 'This is the answer.'}</div>
              </div>
            </div>
          </Card>
          {covered.length > 0 && (
            <Card>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-lg font-bold">
                  This sentence reviews {covered.length} {covered.length === 1 ? 'item' : 'items'}
                </span>
                {phase.failed.size > 0 && <span className="text-muted">{covered.filter((id) => phase.failed.has(id)).length} to repeat</span>}
              </div>
              {covered.map((id) => {
                const bad = phase.failed.has(id)
                return (
                  <div key={id} className="flex items-center gap-2.5 py-1.5">
                    {bad ? <CircleAlert size={20} className="shrink-0 text-lingon" /> : <CircleCheck size={20} className="shrink-0 text-moss" />}
                    <span className="flex-1">{itemName(id)}</span>
                    <span className={`text-sm font-bold ${bad ? 'text-lingon' : 'text-moss'}`}>{bad ? 'needs work' : 'reviewed'}</span>
                  </div>
                )
              })}
            </Card>
          )}
        </>
      )}
    </Focus>
  )
}
