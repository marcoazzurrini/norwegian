import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sentencesWith } from '../../content'
import type { Item } from '../../content/types'
import { gradeCard } from '../../engine/grade'
import type { Mem } from '../../engine/memory'
import { sentenceReady } from '../../engine/select'
import { getState, teach } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Note, Pill } from '../ui'
import { cueKind } from './CardTask'
import type { Frame, TaskResult } from './shared'

const STEPS = ['Hear and see', 'Recall']

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
  items: Item[]
  frame: Frame
  onDone: (result: TaskResult) => void
}

/**
 * Teaches a small group of words or phrases: hear and see each one, then type each one from its meaning.
 * There is no multiple-choice step: recalling a word builds memory better than recognising it,
 * and showing the whole group first keeps the first recall from being a copy.
 */
export function IntroTask({ items, frame, onDone }: Props) {
  const [phase, setPhase] = useState<'show' | 'recall'>('show')
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [misses, setMisses] = useState(0)
  const [recalled, setRecalled] = useState(false)
  const [missed, setMissed] = useState(0)
  const item = items[index]
  const example = useMemo(() => exampleFor(item), [item])
  const [article, word] = item.pos === 'noun' && item.display.includes(' ') ? item.display.split(' ') : ['', item.display]

  useEffect(() => {
    if (phase === 'show') void speak(item.text)
  }, [item, phase])

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

  const next = () => {
    if (index + 1 < items.length) {
      setIndex(index + 1)
      return
    }
    setIndex(0)
    setPhase('recall')
  }

  const nextRecall = () => {
    const wrong = missed + (misses ? 1 : 0)
    if (index + 1 === items.length) {
      onDone({ itemIds: items.map((i) => i.id), right: items.length - wrong, wrong, taught: items.length })
      return
    }
    setMissed(wrong)
    setIndex(index + 1)
    setInput('')
    setMisses(0)
    setRecalled(false)
  }

  return (
    <Focus
      {...frame}
      footer={
        phase === 'show' ? (
          <>
            <span className="text-muted">{index + 1 < items.length ? 'Another new one comes next.' : 'You will type this in a moment.'}</span>
            <Button key={index} autoFocus onClick={next} hint="Enter">
              Continue
            </Button>
          </>
        ) : (
          <>
            <span />
            {recalled ? (
              <Button key="continue" autoFocus onClick={nextRecall} hint="Enter">
                Continue
              </Button>
            ) : (
              <Button key="check" onClick={() => void check()} disabled={!input.trim()} hint="Enter">
                Check
              </Button>
            )}
          </>
        )
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Steps steps={STEPS} active={phase === 'show' ? 0 : 1} />
        {items.length > 1 && (
          <span className="text-muted">
            {index + 1} of {items.length}
          </span>
        )}
      </div>

      {phase === 'show' && (
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

      {phase === 'recall' && (
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
              <AnswerInput key={index} value={input} onChange={setInput} onSubmit={() => void check()} />
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
