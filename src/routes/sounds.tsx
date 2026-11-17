import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Shell } from '../components/Shell'
import { SoundTask } from '../components/tasks/SoundTask'
import { shuffle } from '../components/tasks/shared'
import { Bar, Button, Card, Heading } from '../components/ui'
import { sounds } from '../content'
import type { SoundPair } from '../content/types'
import { useApp } from '../engine/store'
import { useVoices } from '../lib/speech'

export const Route = createFileRoute('/sounds')({ component: SoundsPage })

const DRILL_LENGTH = 10

function SoundsPage() {
  const { meta } = useApp()
  const voices = useVoices()
  const [drill, setDrill] = useState<{ pairs: SoundPair[]; targets: Array<'a' | 'b'>; at: number } | null>(null)

  const groups = useMemo(() => {
    const seen = new Map<string, { title: string; hint: string; pairs: SoundPair[] }>()
    for (const p of sounds) {
      if (!seen.has(p.group)) seen.set(p.group, { title: p.groupTitle, hint: p.hint, pairs: [] })
      seen.get(p.group)!.pairs.push(p)
    }
    return [...seen.entries()]
  }, [])

  const start = (pairs: SoundPair[]) => {
    const list = Array.from({ length: DRILL_LENGTH }, (_, i) => shuffle(pairs)[i % pairs.length])
    setDrill({ pairs: list, targets: list.map(() => (Math.random() < 0.5 ? 'a' : 'b')), at: 0 })
  }

  if (drill) {
    return (
      <SoundTask
        key={drill.at}
        pair={drill.pairs[drill.at]}
        target={drill.targets[drill.at]}
        index={drill.at}
        frame={{ label: `Sounds · ${drill.at + 1} of ${DRILL_LENGTH}`, progress: drill.at / DRILL_LENGTH, onClose: () => setDrill(null) }}
        onDone={() => setDrill(drill.at + 1 < DRILL_LENGTH ? { ...drill, at: drill.at + 1 } : null)}
      />
    )
  }

  return (
    <Shell>
      <div className="flex max-w-[44rem] flex-col gap-5">
        <Heading title="Sounds" sub="Train your ear on the sounds that English does not have." />
        <div>
          <Button onClick={() => start(sounds)}>Practise all sounds</Button>
        </div>
        <p className="m-0 text-muted">
          {voices.length === 0
            ? 'No Norwegian voice is installed on this device. Add one in the system settings.'
            : voices.length === 1
              ? `This device has one Norwegian voice (${voices[0].name}). Ear training works best with several voices.`
              : `This device has ${voices.length} Norwegian voices. The drill switches between them.`}
        </p>
        {groups.map(([id, g]) => {
          const s = meta.sounds[id]
          return (
            <Card key={id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xl font-bold">{g.title}</div>
                  <div className="text-muted">{g.hint}</div>
                </div>
                <Button variant="secondary" className="shrink-0 !px-4 !py-2" onClick={() => start(g.pairs)}>
                  Practise
                </Button>
              </div>
              <div className="mt-3 text-lg">{g.pairs.map((p) => `${p.a.word} / ${p.b.word}`).join('   ·   ')}</div>
              {s && s.total > 0 && (
                <div className="mt-3 flex items-center gap-3.5">
                  <Bar value={s.right / s.total} tone="moss" />
                  <span className="shrink-0 text-muted">
                    {s.right} of {s.total} right
                  </span>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </Shell>
  )
}
