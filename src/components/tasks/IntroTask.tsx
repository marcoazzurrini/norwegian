import { Tag as TagIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sentencesWith } from '../../content'
import type { Item, Sentence } from '../../content/types'
import { gradeCard } from '../../engine/grade'
import type { Mem } from '../../engine/memory'
import { sentenceReady } from '../../engine/select'
import { getState, teach } from '../../engine/store'
import { speak } from '../../lib/speech'
import { AnswerInput } from '../AnswerInput'
import { DockHint, Focus } from '../Focus'
import { AudioButton, Button, Display, Tag } from '../ui'
import { cueKind } from './CardTask'
import { Answer, Ask, Mine, Remark, Stamp, hasArticle, type Frame, type TaskResult } from './shared'

/** The shortest taught sentence that uses the item, as its first example. */
function exampleFor(it: Item) {
  const mem = new Map(getState().memory)
  mem.set(it.id, undefined as unknown as Mem)
  return sentencesWith(it.id)
    .filter((s) => sentenceReady(s, mem) && s.tokens.length > 1)
    .sort((a, b) => a.tokens.length - b.tokens.length)[0]
}

/** The example sentence, with the words of the new item in a heavier weight. */
function Marked({ sentence, id }: { sentence: Sentence; id: string }) {
  const parts: Array<{ text: string; strong: boolean }> = []
  let at = 0
  for (const token of sentence.tokens) {
    const found = sentence.no.indexOf(token.t, at)
    if (found < 0) continue
    if (found > at) parts.push({ text: sentence.no.slice(at, found), strong: false })
    parts.push({ text: token.t, strong: token.w === id || token.c === id })
    at = found + token.t.length
  }
  if (at < sentence.no.length) parts.push({ text: sentence.no.slice(at), strong: false })
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={p.strong ? 'font-semibold' : ''}>
          {p.text}
        </span>
      ))}
    </>
  )
}

function WordFacts({ it }: { it: Item }) {
  const present = it.forms?.find((f) => f.label === 'now')?.form
  const fact =
    it.pos === 'noun' && it.gender && it.gender !== 'pl' ? `${it.gender} word` : it.gender === 'pl' ? 'always plural' : it.pos === 'verb' && present && present !== it.text ? `now: ${present}` : it.kind === 'chunk' ? 'phrase' : null
  if (!it.ipa && !fact) return null
  return (
    <div className="flex flex-wrap items-center gap-2.5 pt-3.5 lg:pt-5">
      {it.ipa && <span className="text-16 text-fg2 lg:text-22">/{it.ipa.replace(/ˈ/g, '')}/</span>}
      {fact && (
        <Tag icon={TagIcon} className="lg:h-8 lg:pr-3.5 lg:pl-2.5 lg:text-15">
          {fact}
        </Tag>
      )}
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
  const [typed, setTyped] = useState('')
  const [wrongArticle, setWrongArticle] = useState(false)
  const [misses, setMisses] = useState(0)
  const [recalled, setRecalled] = useState(false)
  const [missed, setMissed] = useState(0)
  const item = items[index]
  const example = useMemo(() => exampleFor(item), [item])
  const count = items.length > 1 ? ` · ${index + 1} of ${items.length}` : ''
  // A phrase is too long for the largest type.
  const long = item.display.length > 9

  useEffect(() => {
    if (phase === 'show') void speak(item.text)
  }, [item, phase])

  const check = async () => {
    const g = gradeCard(item, input)
    setTyped(input.trim())
    setInput('')
    if (g.correct) {
      setRecalled(true)
      await teach([item.id])
      void speak(item.text)
    } else {
      setWrongArticle(g.wrongArticle)
      setMisses((m) => m + 1)
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
    setTyped('')
    setMisses(0)
    setRecalled(false)
  }

  if (phase === 'show') {
    return (
      <Focus
        {...frame}
        dock={
          <DockHint hint={index + 1 < items.length ? 'Another new one comes next.' : 'You will type this in a moment.'}>
            <Button key={index} autoFocus onClick={next} hint="↵">
              Continue
            </Button>
          </DockHint>
        }
      >
        <Stamp>Step 1 of 2 · Hear and see{count}</Stamp>
        <div key={item.id} className="rise flex flex-col rounded-[1.375rem] border border-line bg-inset p-5 lg:rounded-[2rem] lg:p-11">
          <div className="flex items-center gap-4 lg:gap-9">
            <AudioButton text={item.text} className="size-16 lg:size-[6.5rem]" />
            <div className={`min-w-0 leading-none font-medium tracking-[-0.035em] break-words ${long ? 'text-34 lg:text-[clamp(2.5rem,3.2vw,4.5rem)]' : 'text-word'}`}>
              <Display text={item.display} split={hasArticle(item)} />
            </div>
          </div>
          <WordFacts it={item} />
          <div className="mt-[1.125rem] mb-4 h-px bg-line lg:mt-8 lg:mb-7" />
          <div className="text-24 leading-[1.1] font-medium tracking-[-0.03em] lg:text-40">{item.gloss}</div>
        </div>
        {example && (
          <div key={example.id} className="rise flex max-w-full items-center gap-3 self-start rounded-[1.125rem] bg-raised py-2.5 pr-4 pl-2.5 lg:gap-4 lg:rounded-[1.375rem] lg:py-3.5 lg:pr-6 lg:pl-3.5">
            <AudioButton text={example.no} label="Play the example" className="size-8 lg:size-11" />
            <div className="min-w-0">
              <div className="text-18 lg:text-24">
                <Marked sentence={example} id={item.id} />
              </div>
              <div className="text-14 text-fg2 lg:text-16">{example.en}</div>
            </div>
          </div>
        )}
      </Focus>
    )
  }

  return (
    <Focus
      {...frame}
      scrollKey={`${index}-${misses}-${recalled}`}
      dock={
        recalled ? (
          <DockHint>
            <Button key="continue" autoFocus onClick={nextRecall} hint="↵">
              Continue
            </Button>
          </DockHint>
        ) : (
          <AnswerInput key={index} value={input} onChange={setInput} onSubmit={() => void check()} />
        )
      }
    >
      <Stamp>Step 2 of 2 · Recall{count}</Stamp>
      <Ask key={item.id} note={`${cueKind(item)}. Type it in Norwegian.`}>
        {item.gloss}
      </Ask>
      {typed && <Mine key={`${misses}-${recalled}`}>{typed}</Mine>}
      {recalled ? (
        <Answer audio={<AudioButton text={item.text} className="size-12 lg:size-[3.75rem]" />} good note="Correct. It comes back in a few minutes.">
          <Display text={item.display} split={hasArticle(item)} />
        </Answer>
      ) : misses === 1 ? (
        <Remark lead="Not yet.">{wrongArticle ? 'Is it an en, ei or et word?' : `It starts with “${item.text.slice(0, item.kind === 'chunk' ? 3 : 1)}…”. Try again.`}</Remark>
      ) : misses >= 2 ? (
        <div key={misses} className="rise flex min-w-[13.75rem] flex-col self-start rounded-[1.25rem] border border-line bg-inset p-[1.125rem] lg:min-w-[22.5rem] lg:rounded-[1.625rem] lg:p-7">
          <div className="text-15 text-fg3 lg:text-18">Copy it once</div>
          <div className="pt-1 text-32 leading-[1.1] font-medium tracking-[-0.03em] lg:text-56">
            <Display text={item.answers[0]} split={hasArticle(item)} />
          </div>
        </div>
      ) : null}
    </Focus>
  )
}
