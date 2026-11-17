import { Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SoundPair } from '../../content/types'
import { getState, updateMeta } from '../../engine/store'
import { speak, useVoices } from '../../lib/speech'
import { Focus } from '../Focus'
import { Button, Heading, Note } from '../ui'
import { EMPTY_RESULT, type Frame, type TaskResult } from './shared'

interface Props {
  pair: SoundPair
  target: 'a' | 'b'
  /** Position in the drill, used to change the speaker from one question to the next. */
  index: number
  frame: Frame
  onDone: (result: TaskResult) => void
}

/** Minimal-pair listening: one of two similar words is played, and the learner picks which. */
export function SoundTask({ pair, target, index, frame, onDone }: Props) {
  const voices = useVoices()
  const [picked, setPicked] = useState<'a' | 'b' | null>(null)
  const play = () => void speak(pair[target].word, { voiceIndex: index, rate: 0.8 })

  useEffect(() => {
    const t = setTimeout(play, 350)
    return () => clearTimeout(t)
    // Play once per question; the voices arrive asynchronously on some browsers.
  }, [pair.id, target, voices.length])

  const pick = async (side: 'a' | 'b') => {
    if (picked) return
    setPicked(side)
    const s = getState().meta.sounds[pair.group] ?? { right: 0, total: 0 }
    await updateMeta({ sounds: { ...getState().meta.sounds, [pair.group]: { right: s.right + (side === target ? 1 : 0), total: s.total + 1 } } })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '1') void pick('a')
      if (e.key === '2') void pick('b')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const right = picked === target

  return (
    <Focus
      {...frame}
      footer={
        <>
          <Button variant="secondary" onClick={play}>
            Play again
          </Button>
          {picked ? (
            <Button autoFocus onClick={() => onDone({ ...EMPTY_RESULT, right: right ? 1 : 0, wrong: right ? 0 : 1 })} hint="Enter">
              Continue
            </Button>
          ) : (
            <span />
          )}
        </>
      }
    >
      <Heading title="Which word do you hear?" sub={pair.hint} />
      {voices.length === 0 && (
        <Note tone="lingon" title="No Norwegian voice found.">
          This device has no Norwegian voice installed. Add one in the system settings, under spoken content or text-to-speech.
        </Note>
      )}
      <div className="flex justify-center py-2">
        <button type="button" onClick={play} aria-label="Play the word" className="flex h-24 w-24 items-center justify-center rounded-full bg-fjord text-white">
          <Volume2 size={40} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {(['a', 'b'] as const).map((side, i) => {
          const isTarget = picked && side === target
          const isWrongPick = picked === side && side !== target
          return (
            <button
              key={side}
              type="button"
              onClick={() => (picked ? void speak(pair[side].word, { voiceIndex: index, rate: 0.8 }) : void pick(side))}
              className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-4 py-6 ${
                isTarget ? 'border-moss bg-moss-soft' : isWrongPick ? 'border-lingon bg-lingon-soft' : 'border-line bg-surface'
              }`}
            >
              <span className="text-4xl font-bold text-ink sm:text-5xl">{pair[side].word}</span>
              <span className="text-muted">{pair[side].gloss}</span>
              {!picked && <kbd className="mt-2 hidden rounded-md border border-line px-2.5 text-sm text-muted sm:block">{i + 1}</kbd>}
            </button>
          )
        })}
      </div>
      {picked && (
        <Note tone={right ? 'moss' : 'lingon'} title={right ? 'Correct.' : `It was “${pair[target].word}”.`}>
          Tap each word to hear the difference.
        </Note>
      )}
    </Focus>
  )
}
