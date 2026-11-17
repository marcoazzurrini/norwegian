import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Focus } from '../components/Focus'
import { CardTask } from '../components/tasks/CardTask'
import { IntroTask } from '../components/tasks/IntroTask'
import { PatternTask } from '../components/tasks/PatternTask'
import { SentenceTask } from '../components/tasks/SentenceTask'
import type { Frame, TaskResult } from '../components/tasks/shared'
import { SoundTask } from '../components/tasks/SoundTask'
import { StoryTask } from '../components/tasks/StoryTask'
import { Card, Heading } from '../components/ui'
import { lessons } from '../content'
import { lessonState } from '../engine/select'
import { Session, blockOf, type Task } from '../engine/session'
import { addStudyTime, getState, updateMeta } from '../engine/store'
import { stopSpeaking } from '../lib/speech'

export const Route = createFileRoute('/session')({
  validateSearch: (s: Record<string, unknown>) => ({ minutes: Math.min(120, Math.max(1, Number(s.minutes) || 15)) }),
  component: SessionPage,
})

/** Time counted for one task is capped, so a break in the middle does not inflate study time. */
const MAX_TASK_MS = 3 * 60_000
const BLOCK_LABEL = { sounds: 'Sounds', review: 'Review', new: 'New', story: 'Story' }

function SessionPage() {
  const { minutes } = Route.useSearch()
  const navigate = useNavigate()
  const session = useRef<Session>(null as unknown as Session)
  session.current ??= new Session(minutes)
  const [task, setTask] = useState<Task | null>(null)
  const [count, setCount] = useState(0)
  const startedAt = useRef(Date.now())

  const advance = useCallback(() => {
    const { memory, meta } = getState()
    startedAt.current = Date.now()
    setTask(session.current.next({ memory, storiesDone: new Set(meta.storiesDone), chosenLesson: meta.chosenLesson, soundStats: meta.sounds }, Date.now()))
    setCount((c) => c + 1)
  }, [])

  useEffect(() => {
    advance()
    return () => void stopSpeaking()
  }, [advance])

  const onDone = async (result: TaskResult) => {
    if (!task || task.type === 'done') return
    const ms = Math.min(MAX_TASK_MS, Date.now() - startedAt.current)
    const s = session.current
    s.record(ms, blockOf(task), result.itemIds)
    s.stats.right += result.right
    s.stats.wrong += result.wrong
    s.stats.taught += result.taught
    if (blockOf(task) === 'review') s.stats.reviewed += result.itemIds.length
    await addStudyTime(ms)
    // A lesson picked on the Map stops being "chosen" once it is finished.
    const { memory, meta } = getState()
    if (meta.chosenLesson != null && lessonState(lessons[meta.chosenLesson], memory) === 'done') await updateMeta({ chosenLesson: null })
    advance()
  }

  if (!task) return null

  const s = session.current
  const left = Math.max(0, Math.ceil((s.budgetMs - s.elapsedMs) / 60_000))
  const frame: Frame = {
    label: task.type === 'done' ? 'Done' : `${BLOCK_LABEL[blockOf(task)]} · ${left} min left`,
    progress: s.progress,
    onClose: () => void navigate({ to: '/' }),
  }

  switch (task.type) {
    case 'sound':
      return <SoundTask key={count} pair={task.pair} target={task.target} index={task.index} frame={{ ...frame, label: `Sounds · ${task.index + 1} of ${task.total}` }} onDone={onDone} />
    case 'intro':
      return <IntroTask key={count} items={task.items} frame={frame} onDone={onDone} />
    case 'pattern':
      return <PatternTask key={count} item={task.item} practice={task.practice} frame={frame} onDone={onDone} />
    case 'card':
      return <CardTask key={count} item={task.item} frame={frame} onDone={onDone} />
    case 'sentence':
      return <SentenceTask key={count} sentence={task.sentence} frame={frame} onDone={onDone} />
    case 'story':
      return <StoryTask key={count} story={task.story} frame={frame} onDone={onDone} />
    case 'done': {
      const answered = s.stats.right + s.stats.wrong
      const timeUp = s.elapsedMs >= s.budgetMs
      return (
        <Focus {...frame} progress={1}>
          <Heading title="Ferdig!" sub={timeUp ? 'Finished. Your time is up.' : 'Finished. Nothing more is due right now.'} />
          <Card>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              {[
                [Math.max(1, Math.round(s.elapsedMs / 60_000)), 'minutes'],
                [s.stats.taught, 'new items'],
                [s.stats.reviewed, 'items reviewed'],
                [answered ? `${Math.round((s.stats.right / answered) * 100)}%` : '–', 'right first time'],
              ].map(([n, label]) => (
                <div key={label}>
                  <div className="text-3xl font-bold text-fjord">{n}</div>
                  <div className="text-muted">{label}</div>
                </div>
              ))}
            </div>
          </Card>
          {s.stats.taught > 0 && <p className="m-0 text-lg text-muted">New items come back within minutes at first. Open the app again later today, or tomorrow.</p>}
          <Link to="/" className="self-start rounded-2xl bg-fjord px-6 py-3.5 text-lg font-bold text-white no-underline">
            Back to Today
          </Link>
        </Focus>
      )
    }
  }
}
