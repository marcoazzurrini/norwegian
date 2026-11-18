import { createFileRoute } from '@tanstack/react-router'
import { Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Shell } from '../components/Shell'
import { SoundTask } from '../components/tasks/SoundTask'
import { shuffle } from '../components/tasks/shared'
import { Button, Card, PageTitle, Progress } from '../components/ui'
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
        frame={{ block: 'sounds', title: 'Sounds', label: `${drill.at + 1} of ${DRILL_LENGTH}`, progress: drill.at / DRILL_LENGTH, onClose: () => setDrill(null) }}
        onDone={() => setDrill(drill.at + 1 < DRILL_LENGTH ? { ...drill, at: drill.at + 1 } : null)}
      />
    )
  }

  return (
    <Shell>
      <PageTitle title="Sounds" sub="Train your ear on the sounds that English does not have.">
        <Button onClick={() => start(sounds)} className="w-full lg:w-auto">
          <Play className="size-[1.125rem]" />
          Practise all sounds
        </Button>
      </PageTitle>
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {groups.map(([id, g]) => {
            const s = meta.sounds[id]
            return (
              <Card key={id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-19 leading-[1.15] font-medium tracking-[-0.02em] lg:text-26">{g.title}</div>
                    <div className="pt-1 text-14 text-fg2 lg:text-16">{g.hint}</div>
                  </div>
                  <Button variant="secondary" size="small" onClick={() => start(g.pairs)}>
                    Practise
                  </Button>
                </div>
                <div className="pt-3 text-16 font-medium lg:pt-5 lg:text-20">{g.pairs.map((p) => `${p.a.word} / ${p.b.word}`).join('  ·  ')}</div>
                <div className="flex-1" />
                {s && s.total > 0 ? (
                  <div className="flex items-center gap-3.5 pt-3 lg:pt-5">
                    <Progress value={s.right / s.total} className="flex-1" />
                    <span className="shrink-0 text-14 leading-[1.45] text-fg2">
                      {s.right} of {s.total} right
                    </span>
                  </div>
                ) : (
                  <div className="pt-3 text-14 leading-[1.45] text-fg3 lg:pt-5">Not practised yet</div>
                )}
              </Card>
            )
          })}
        </div>
        <p className="m-0 text-14 text-fg3 lg:text-18">
          {voices.length === 0
            ? 'No Norwegian voice is installed on this device. Add one in the system settings.'
            : voices.length === 1
              ? `This device has one Norwegian voice (${voices[0].name}). Ear training works best with several voices.`
              : `This device has ${voices.length} Norwegian voices. The drill switches between them.`}
        </p>
      </div>
    </Shell>
  )
}
