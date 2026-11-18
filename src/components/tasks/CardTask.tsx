import { useState } from 'react'
import type { Item } from '../../content/types'
import { gradeCard } from '../../engine/grade'
import { applyReviews } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { DockRow, Focus } from '../Focus'
import { AudioButton, Button, Display } from '../ui'
import { Answer, Ask, Mine, Remark, Stamp, hasArticle, type Frame, type TaskResult } from './shared'

/** What the learner is asked to type, in words. */
export function cueKind(it: Item): string {
  if (it.kind === 'chunk') return 'Phrase'
  if (it.pos === 'noun' && it.gender && it.gender !== 'pl') return 'Noun, with en, ei or et'
  if (it.pos === 'verb') return 'Verb'
  return 'Word'
}

/** A prompt that points at the problem without giving the answer. */
export function cardHint(it: Item, wrongArticle: boolean): string {
  if (wrongArticle) return 'The word is right. Is it an en, ei or et word?'
  const first = it.text.replace(/_/g, '').trim()
  return `It starts with “${first.slice(0, it.kind === 'chunk' ? 3 : 1)}…”.`
}

interface Props {
  item: Item
  frame: Frame
  onDone: (result: TaskResult) => void
}

type Phase = { step: 'ask' } | { step: 'retry'; wrongArticle: boolean } | { step: 'result'; firstTry: boolean; correct: boolean }

/** A single item on its own: meaning shown, Norwegian typed. */
export function CardTask({ item, frame, onDone }: Props) {
  const [input, setInput] = useState('')
  const [typed, setTyped] = useState('')
  const [phase, setPhase] = useState<Phase>({ step: 'ask' })

  const reveal = (firstTry: boolean, correct: boolean) => {
    setPhase({ step: 'result', firstTry, correct })
    void speak(item.text)
  }

  const check = () => {
    const g = gradeCard(item, input)
    setTyped(input.trim())
    setInput('')
    if (phase.step === 'ask') {
      if (g.correct) reveal(true, true)
      else setPhase({ step: 'retry', wrongArticle: g.wrongArticle })
    } else if (phase.step === 'retry') reveal(false, g.correct)
  }

  const done = async (good: boolean) => {
    await applyReviews([{ id: item.id, grade: good ? 'good' : 'again' }])
    onDone({ itemIds: [item.id], right: good ? 1 : 0, wrong: good ? 0 : 1, taught: 0 })
  }

  return (
    <Focus
      {...frame}
      scrollKey={phase.step}
      dock={
        phase.step === 'result' ? (
          <DockRow>
            {!phase.firstTry ? (
              <Button variant="secondary" onClick={() => void done(true)}>
                It was a typo
              </Button>
            ) : (
              <span />
            )}
            <Button key="continue" autoFocus onClick={() => void done(phase.firstTry)} hint="↵">
              Continue
            </Button>
          </DockRow>
        ) : (
          <AnswerInput key={phase.step} value={input} onChange={setInput} onSubmit={check} placeholder={phase.step === 'retry' ? 'Try again' : 'Type in Norwegian'} />
        )
      }
    >
      <Stamp>Review</Stamp>
      <Ask note={`${cueKind(item)}. Type it in Norwegian.`}>{item.gloss}</Ask>
      {typed && <Mine>{typed}</Mine>}

      {phase.step === 'retry' && (
        <>
          <Remark lead="Not yet.">{cardHint(item, phase.wrongArticle)}</Remark>
          <Button variant="outline" size="medium" className="rise self-start" onClick={() => reveal(false, false)}>
            Show answer
          </Button>
        </>
      )}

      {phase.step === 'result' && (
        <Answer
          audio={<AudioButton text={item.text} className="size-12 lg:size-[3.75rem]" />}
          good={phase.correct}
          note={phase.firstTry ? 'Correct.' : phase.correct ? 'Correct on the second try. It will come back soon.' : 'This is the answer. It will come back soon.'}
        >
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      )}
    </Focus>
  )
}
