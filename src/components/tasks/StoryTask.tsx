import { Play, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { items } from '../../content'
import type { Story, Token } from '../../content/types'
import { itemState } from '../../engine/select'
import { getState, updateMeta, useApp } from '../../engine/store'
import { speak, stopSpeaking } from '../../lib/speech'
import { Focus } from '../Focus'
import { AudioButton, Button, Card, Heading, Pill } from '../ui'
import { Choices, EMPTY_RESULT, type Frame, type TaskResult } from './shared'

interface Picked {
  line: number
  index: number
  token: Token
}

/** What a tapped word means: its taught item, or the story's own gloss for a new word. */
function lookup(story: Story, t: Token) {
  const id = t.w ?? t.c
  if (id) return { text: items[id].display, gloss: items[id].gloss, item: items[id] }
  const gloss = story.glosses[t.t.toLowerCase()]
  return gloss ? { text: t.t, gloss, item: null } : null
}

interface Props {
  story: Story
  frame: Frame
  onDone: (result: TaskResult) => void
}

/** A short text built from known words: listen while reading, tap a word for its meaning, then answer questions. */
export function StoryTask({ story, frame, onDone }: Props) {
  const { memory } = useApp()
  const [picked, setPicked] = useState<Picked | null>(null)
  const [playing, setPlaying] = useState<number | null>(null)
  const [question, setQuestion] = useState<number | null>(null)
  const [showEnglish, setShowEnglish] = useState(false)
  const stop = useRef(false)

  useEffect(() => () => void stopSpeaking(), [])

  const playAll = async () => {
    if (playing !== null) {
      stop.current = true
      stopSpeaking()
      setPlaying(null)
      return
    }
    stop.current = false
    for (let i = 0; i < story.lines.length && !stop.current; i++) {
      setPlaying(i)
      await speak(story.lines[i].no)
    }
    setPlaying(null)
  }

  const finish = async () => {
    const done = getState().meta.storiesDone
    if (!done.includes(story.id)) await updateMeta({ storiesDone: [...done, story.id] })
    onDone(EMPTY_RESULT)
  }

  const meaning = picked && lookup(story, picked.token)

  if (question !== null) {
    const q = story.questions[question]
    return (
      <Focus {...frame}>
        <Heading title={q.prompt} sub={`Question ${question + 1} of ${story.questions.length}`} />
        <Choices key={question} quiz={q} onRight={() => (question + 1 < story.questions.length ? setQuestion(question + 1) : void finish())} />
      </Focus>
    )
  }

  return (
    <Focus
      {...frame}
      footer={
        <>
          <Button variant="secondary" onClick={() => setShowEnglish((s) => !s)}>
            {showEnglish ? 'Hide English' : 'Show English'}
          </Button>
          <Button onClick={() => (story.questions.length ? setQuestion(0) : void finish())}>Questions</Button>
        </>
      }
    >
      <div className="flex items-end justify-between gap-4">
        <Heading title={story.title} sub={`${story.titleEn}. Listen and read along.`} />
        <button
          type="button"
          onClick={() => void playAll()}
          aria-label={playing !== null ? 'Stop' : 'Play the whole story'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-fjord text-white"
        >
          {playing !== null ? <Square size={22} /> : <Play size={24} />}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {story.lines.map((line, li) => (
          <div key={li} className={`flex gap-3 rounded-xl border px-3 py-2.5 sm:gap-4 sm:px-4 ${playing === li ? 'border-line bg-surface' : 'border-transparent'}`}>
            <button type="button" onClick={() => void speak(line.no)} className="w-14 shrink-0 border-0 bg-transparent p-0 pt-2 text-left text-sm font-bold text-muted" aria-label={`Play ${line.who}'s line`}>
              {line.who}
            </button>
            <div className="flex-1">
              <p className="m-0 text-2xl leading-relaxed">
                {splitLine(line.no, line.tokens).map((part, pi) =>
                  part.token ? (
                    <button
                      key={pi}
                      type="button"
                      onClick={() => setPicked({ line: li, index: part.index!, token: part.token! })}
                      className={`rounded-md border-0 bg-transparent p-0 text-inherit ${
                        picked?.line === li && picked.index === part.index
                          ? 'bg-fjord-soft font-bold text-fjord'
                          : story.glosses[part.token.t.toLowerCase()] && !part.token.w
                            ? 'border-b-2 border-dotted border-sun font-bold text-sun'
                            : ''
                      }`}
                    >
                      {part.text}
                    </button>
                  ) : (
                    <span key={pi}>{part.text}</span>
                  ),
                )}
              </p>
              {showEnglish && <p className="m-0 text-lg text-muted">{line.en}</p>}
            </div>
          </div>
        ))}
      </div>

      {meaning ? (
        <Card className="rise !p-4">
          <div className="flex items-center gap-4">
            <AudioButton text={meaning.item?.text ?? meaning.text} size={40} />
            <div className="flex-1">
              <div className="text-2xl font-bold">{meaning.text}</div>
              <div className="text-lg text-muted">{meaning.gloss}</div>
            </div>
            {meaning.item ? (
              <Pill tone={itemState(meaning.item, memory) === 'stable' ? 'moss' : itemState(meaning.item, memory) === 'learning' ? 'sun' : 'neutral'}>
                {itemState(meaning.item, memory) === 'stable' ? 'Stable' : itemState(meaning.item, memory) === 'learning' ? 'Learning' : 'Not taught yet'}
              </Pill>
            ) : (
              <Pill tone="sun">New word</Pill>
            )}
          </div>
        </Card>
      ) : (
        <p className="m-0 text-muted">Tap a word to see its meaning. Tap a name to hear the line.</p>
      )}
    </Focus>
  )
}

/** Cuts a line into its words and the punctuation between them, keeping each word linked to its token. */
function splitLine(text: string, tokens: Token[]): Array<{ text: string; token?: Token; index?: number }> {
  const parts: Array<{ text: string; token?: Token; index?: number }> = []
  let at = 0
  tokens.forEach((token, index) => {
    const found = text.indexOf(token.t, at)
    if (found < 0) return
    if (found > at) parts.push({ text: text.slice(at, found) })
    parts.push({ text: token.t, token, index })
    at = found + token.t.length
  })
  if (at < text.length) parts.push({ text: text.slice(at) })
  return parts
}
