import { ArrowRight, Ruler } from 'lucide-react'
import { useState } from 'react'
import type { Example, Item, Sentence } from '../../content/types'
import { teach } from '../../engine/store'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Heading, Note } from '../ui'
import { Steps } from './IntroTask'
import { SentenceTask } from './SentenceTask'
import { Choices, type Frame, type TaskResult } from './shared'

/** Splits "en bil > bilen" and marks the part of the second form that is new. */
function contrast(no: string): { from?: string; to: string; added: string } {
  const [a, b] = no.split('>').map((s) => s.trim())
  if (!b) return { to: a, added: '' }
  const base = a.split(' ').pop()!.replace(/[!?.]/g, '')
  const target = b.split(' ').pop()!
  const prefix = b.slice(0, b.length - target.length)
  if (target.startsWith(base) && target.length > base.length) return { from: a, to: prefix + base, added: target.slice(base.length) }
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i > 2 && i < b.length ? { from: a, to: b.slice(0, i), added: b.slice(i) } : { from: a, to: b, added: '' }
}

function ExampleRow({ ex }: { ex: Example }) {
  const c = contrast(ex.no)
  const spoken = ex.no.split('>').pop()!.trim()
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line py-3.5 first:border-t-0">
      <AudioButton text={spoken} size={40} />
      {c.from && (
        <>
          <span className="text-2xl text-muted">{c.from}</span>
          <ArrowRight size={20} className="text-muted" aria-label="becomes" />
        </>
      )}
      <span className="flex-1 text-2xl font-bold">
        {c.to}
        {c.added && <span className="rounded-md bg-lingon-soft px-1 text-lingon">{c.added}</span>}
      </span>
      <span className="text-lg text-muted">{ex.en}</span>
    </div>
  )
}

interface Props {
  item: Item
  practice: Sentence[]
  frame: Frame
  onDone: (result: TaskResult) => void
}

/** Teaches a grammar pattern: contrasting examples and a short rule, reading questions, then typed sentences. */
export function PatternTask({ item, practice, frame, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [quizIndex, setQuizIndex] = useState(0)
  const [practiceIndex, setPracticeIndex] = useState(0)
  const [result, setResult] = useState<TaskResult>({ itemIds: [item.id], right: 0, wrong: 0, taught: 1 })
  const quiz = item.quiz ?? []
  const steps = ['See it', 'Read it', ...(practice.length ? ['Produce it'] : [])]

  const afterQuiz = async () => {
    await teach([item.id])
    if (practice.length) setStep(2)
    else onDone(result)
  }

  if (step === 2) {
    return (
      <SentenceTask
        key={practice[practiceIndex].id}
        sentence={practice[practiceIndex]}
        frame={{ ...frame, label: `${item.title} · ${practiceIndex + 1} of ${practice.length}` }}
        onDone={(r) => {
          const merged = { ...result, right: result.right + r.right, wrong: result.wrong + r.wrong }
          if (practiceIndex + 1 < practice.length) {
            setResult(merged)
            setPracticeIndex(practiceIndex + 1)
          } else onDone(merged)
        }}
      />
    )
  }

  return (
    <Focus
      {...frame}
      footer={
        step === 0 ? (
          <>
            <span className="text-muted">Next: {quiz.length} quick {quiz.length === 1 ? 'question' : 'questions'}.</span>
            <Button autoFocus onClick={() => (quiz.length ? setStep(1) : void afterQuiz())} hint="Enter">
              Continue
            </Button>
          </>
        ) : undefined
      }
    >
      <Steps steps={steps} active={step} />
      {step === 0 && (
        <>
          <Heading title={item.title!} sub="Watch what changes." />
          <Card className="!py-2">
            {item.examples!.map((ex) => (
              <ExampleRow key={ex.no} ex={ex} />
            ))}
          </Card>
          <Note tone="fjord" icon={<Ruler size={22} />} title="The rule">
            {item.rule!.map((r) => (
              <p key={r} className="m-0 mt-1 first:mt-0">
                {r}
              </p>
            ))}
          </Note>
        </>
      )}
      {step === 1 && quiz[quizIndex] && (
        <>
          <div>
            <div className="font-bold text-muted">What does it mean?</div>
            <div className="mt-1.5 flex items-center gap-4">
              <AudioButton text={quiz[quizIndex].prompt} size={48} />
              <span className="text-3xl font-bold sm:text-4xl">{quiz[quizIndex].prompt}</span>
            </div>
          </div>
          <Choices key={quizIndex} quiz={quiz[quizIndex]} onRight={() => (quizIndex + 1 < quiz.length ? setQuizIndex(quizIndex + 1) : void afterQuiz())} />
        </>
      )}
    </Focus>
  )
}
