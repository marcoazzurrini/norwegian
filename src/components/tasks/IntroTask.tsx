import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { items, sentencesWith } from '../../content'
import type { Item, Quiz } from '../../content/types'
import { gradeCard } from '../../engine/grade'
import type { Mem } from '../../engine/memory'
import { sentenceReady } from '../../engine/select'
import { getState, teach } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Note, Pill } from '../ui'
import { cueKind } from './CardTask'
import { Choices, shuffle, type Frame, type TaskResult } from './shared'

const STEPS = ['Hear and see', 'Recognise', 'Recall']

export function Steps({ steps, active }: { steps: string[]; active: number }) {
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-x-2.5 gap-y-2 p-0">
      {steps.map((s, i) => (
        <li key={s} className={`flex items-center gap-2 ${i === active ? 'font-bold text-fjord' : 'text-muted'}`}>
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${
              i < active ? 'bg-fjord text-white' : i === active ? 'bg-fjord-soft' : 'border border-line'
            }`}
          >
            {i < active ? <Check size={15} /> : i + 1}
          </span>
          {s}
          {i < steps.length - 1 && <span className="ml-1 hidden h-px w-7 bg-line sm:block" />}
        </li>
      ))}
    </ol>
  )
}

/** The shortest taught sentence that uses the item, as its first example. */
function exampleFor(it: Item) {
  const mem = new Map(getState().memory)
  mem.set(it.id, undefined as unknown as Mem)
  return sentencesWith(it.id)
    .filter((s) => sentenceReady(s, mem) && s.tokens.length > 1)
    .sort((a, b) => a.tokens.length - b.tokens.length)[0]
}

/** Three wrong meanings from nearby lessons, of the same kind of item. */
function meaningQuiz(it: Item): Quiz {
  const near = Object.values(items).filter((o) => o.id !== it.id && o.kind === it.kind && o.gloss !== it.gloss && Math.abs(o.lesson - it.lesson) <= 8)
  const samePos = near.filter((o) => o.pos === it.pos)
  const pool = samePos.length >= 3 ? samePos : near
  return { prompt: it.display, options: [it.gloss, ...shuffle(pool).slice(0, 3).map((o) => o.gloss)] }
}

function WordFacts({ it }: { it: Item }) {
  const present = it.forms?.find((f) => f.label === 'now')?.form
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2.5">
      {it.ipa && <span className="text-lg text-muted">/{it.ipa.replace(/ˈ/g, '')}/</span>}
      {it.pos === 'noun' && it.gender && it.gender !== 'pl' && <Pill>{it.gender} word</Pill>}
      {it.gender === 'pl' && <Pill>always plural</Pill>}
      {it.pos === 'verb' && present && present !== it.text && <Pill>now: {present}</Pill>}
      {it.kind === 'chunk' && <Pill>phrase</Pill>}
    </div>
  )
}

interface Props {
  item: Item
  frame: Frame
  onDone: (result: TaskResult) => void
}

/** Teaches one word or phrase: hear and see it, recognise its meaning, then type it from the meaning. */
export function IntroTask({ item, frame, onDone }: Props) {
  const [step, setStep] = useState(0)
  const [input, setInput] = useState('')
  const [misses, setMisses] = useState(0)
  const [recalled, setRecalled] = useState(false)
  const example = useMemo(() => exampleFor(item), [item])
  const quiz = useMemo(() => meaningQuiz(item), [item])
  const [article, word] = item.pos === 'noun' && item.display.includes(' ') ? item.display.split(' ') : ['', item.display]

  useEffect(() => {
    void speak(item.text)
  }, [item])

  const check = async () => {
    if (gradeCard(item, input).correct) {
      setRecalled(true)
      await teach([item.id])
      void speak(item.text)
    } else {
      setMisses((m) => m + 1)
      setInput('')
    }
  }

  return (
    <Focus
      {...frame}
      footer={
        step === 0 ? (
          <>
            <span className="text-muted">You will type this in a moment.</span>
            <Button autoFocus onClick={() => setStep(1)} hint="Enter">
              Continue
            </Button>
          </>
        ) : step === 2 ? (
          <>
            <span />
            {recalled ? (
              <Button autoFocus onClick={() => onDone({ itemIds: [item.id], right: misses ? 0 : 1, wrong: misses ? 1 : 0, taught: 1 })} hint="Enter">
                Continue
              </Button>
            ) : (
              <Button onClick={() => void check()} disabled={!input.trim()} hint="Enter">
                Check
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <Steps steps={STEPS} active={step} />

      {step === 0 && (
        <>
          <Card className="!p-6 sm:!p-8">
            <div className="flex items-center gap-5">
              <AudioButton text={item.text} size={64} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  {article && <span className="text-3xl text-muted">{article}</span>}
                  <span className={`leading-tight font-bold tracking-wide ${item.kind === 'chunk' ? 'text-4xl' : 'text-5xl sm:text-6xl'}`}>{word}</span>
                </div>
                <WordFacts it={item} />
              </div>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <div className="text-3xl font-bold">{item.gloss}</div>
            </div>
          </Card>
          {example && (
            <Card>
              <div className="mb-2 text-sm font-bold text-muted">Example</div>
              <div className="flex items-center gap-4">
                <AudioButton text={example.no} size={40} label="Play the example" />
                <div>
                  <div className="text-2xl">{example.no}</div>
                  <div className="text-lg text-muted">{example.en}</div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <div>
            <div className="font-bold text-muted">What does it mean?</div>
            <div className="mt-1.5 flex items-center gap-4">
              <AudioButton text={item.text} size={48} />
              <span className="text-4xl font-bold">{item.display}</span>
            </div>
          </div>
          <Choices quiz={quiz} onRight={() => setStep(2)} />
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <div className="font-bold text-muted">{cueKind(item)}. Type it in Norwegian.</div>
            <div className="mt-1.5 text-3xl leading-tight font-bold sm:text-4xl">{item.gloss}</div>
          </div>
          {recalled ? (
            <Card className="!border-moss">
              <div className="flex items-center gap-4">
                <AudioButton text={item.text} size={48} />
                <div>
                  <div className="text-3xl font-bold">{item.display}</div>
                  <div className="text-muted">Correct. It comes back in a few minutes.</div>
                </div>
              </div>
            </Card>
          ) : (
            <>
              <AnswerInput value={input} onChange={setInput} onSubmit={() => void check()} />
              {misses === 1 && (
                <Note tone="lingon" title="Not yet.">
                  {gradeCard(item, input).wrongArticle ? 'Is it an en, ei or et word?' : `It starts with “${item.text.slice(0, item.kind === 'chunk' ? 3 : 1)}…”. Try again.`}
                </Note>
              )}
              {misses >= 2 && (
                <Note tone="sun" title="Copy it once.">
                  <span className="text-2xl font-bold">{item.answers[0]}</span>
                </Note>
              )}
            </>
          )}
        </>
      )}
    </Focus>
  )
}
