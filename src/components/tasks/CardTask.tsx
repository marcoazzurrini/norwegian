import { MessageCircleQuestion } from 'lucide-react'
import { useState } from 'react'
import type { Item } from '../../content/types'
import { gradeCard } from '../../engine/grade'
import { applyReviews } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Note } from '../ui'
import type { Frame, TaskResult } from './shared'

/** What the learner is asked to type, in words. */
export function cueKind(it: Item): string {
  if (it.kind === 'chunk') return 'Phrase'
  if (it.pos === 'noun' && it.gender && it.gender !== 'pl') return 'Noun, with en, ei or et'
  if (it.pos === 'verb') return 'Verb'
  return 'Word'
}

function hint(it: Item, wrongArticle: boolean): string {
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
  const [phase, setPhase] = useState<Phase>({ step: 'ask' })

  const reveal = (firstTry: boolean, correct: boolean) => {
    setPhase({ step: 'result', firstTry, correct })
    void speak(item.text)
  }

  const check = () => {
    const g = gradeCard(item, input)
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
      footer={
        phase.step === 'result' ? (
          <>
            {!phase.firstTry ? (
              <Button variant="secondary" onClick={() => void done(true)}>
                It was a typo
              </Button>
            ) : (
              <span />
            )}
            <Button key="continue" autoFocus onClick={() => void done(phase.firstTry)} hint="Enter">
              Continue
            </Button>
          </>
        ) : (
          <>
            {phase.step === 'retry' ? (
              <Button variant="secondary" onClick={() => reveal(false, false)}>
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
        <div className="font-bold text-muted">{cueKind(item)}. Type it in Norwegian.</div>
        <div className="mt-1.5 text-3xl leading-tight font-bold sm:text-4xl">{item.gloss}</div>
      </div>

      {phase.step !== 'result' && <AnswerInput value={input} onChange={setInput} onSubmit={check} />}

      {phase.step === 'retry' && (
        <Note tone="lingon" icon={<MessageCircleQuestion size={22} />} title="Not yet.">
          {hint(item, phase.wrongArticle)}
        </Note>
      )}

      {phase.step === 'result' && (
        <Card className={phase.firstTry ? '!border-moss' : ''}>
          <div className="flex items-center gap-4">
            <AudioButton text={item.text} size={48} />
            <div>
              <div className="text-3xl font-bold">{item.display}</div>
              <div className="text-muted">{phase.firstTry ? 'Correct.' : phase.correct ? 'Correct on the second try. It will come back soon.' : 'This is the answer. It will come back soon.'}</div>
            </div>
          </div>
        </Card>
      )}
    </Focus>
  )
}
