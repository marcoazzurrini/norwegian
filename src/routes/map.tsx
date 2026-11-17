import { Link, createFileRoute } from '@tanstack/react-router'
import { CircleCheck, Loader, Lock, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '../components/Shell'
import { Button, Card, Heading, Pill } from '../components/ui'
import { items, lessons, units, unlockedBy } from '../content'
import type { Lesson } from '../content/types'
import { itemState, lessonState, nextLesson, type LessonState, type Memory } from '../engine/select'
import { updateMeta, useApp } from '../engine/store'

export const Route = createFileRoute('/map')({ component: MapPage })

const NODE_W = 164
const NODE_H = 52
const GAP_X = 18
const ROW_H = 96

const LOOK: Record<LessonState, { box: string; label: string; tone: 'moss' | 'sun' | 'fjord' | 'neutral' }> = {
  done: { box: 'bg-moss-soft text-moss border-transparent', label: 'Learned', tone: 'moss' },
  started: { box: 'bg-sun-soft text-sun border-transparent', label: 'In progress', tone: 'sun' },
  ready: { box: 'bg-fjord text-white border-transparent', label: 'Ready to learn', tone: 'fjord' },
  locked: { box: 'bg-paper text-muted border-dashed border-[#bdb5a5]', label: 'Locked', tone: 'neutral' },
}
const ICON = { done: CircleCheck, started: Loader, ready: Play, locked: Lock }

/** Places every lesson on a row one below its deepest need, so needs always point upward. */
function layout() {
  const depth: number[] = []
  for (const l of lessons) depth[l.index] = l.needs.length ? Math.max(...l.needs.map((n) => depth[n])) + 1 : 0
  const rows: Lesson[][] = []
  for (const l of lessons) (rows[depth[l.index]] ??= []).push(l)
  const widest = Math.max(...rows.map((r) => r.length))
  const width = widest * NODE_W + (widest - 1) * GAP_X
  const pos = new Map<number, { x: number; y: number }>()
  rows.forEach((row, d) => {
    const rowWidth = row.length * NODE_W + (row.length - 1) * GAP_X
    row.forEach((l, i) => pos.set(l.index, { x: (width - rowWidth) / 2 + i * (NODE_W + GAP_X), y: d * ROW_H }))
  })
  return { pos, width, height: (rows.length - 1) * ROW_H + NODE_H }
}

function Detail({ lesson, memory, chosen }: { lesson: Lesson; memory: Memory; chosen: number | null }) {
  const state = lessonState(lesson, memory)
  const unit = units[lesson.unit - 1]
  const row = (l: Lesson) => (
    <div key={l.index} className="flex justify-between gap-3 border-t border-line py-2.5">
      <span>{l.title}</span>
      <span className="shrink-0 text-muted">{LOOK[lessonState(l, memory)].label}</span>
    </div>
  )
  return (
    <Card>
      <Pill tone={LOOK[state].tone}>{LOOK[state].label}</Pill>
      <h2 className="m-0 mt-3 text-2xl leading-tight font-bold">{lesson.title}</h2>
      <p className="m-0 mb-4 text-lg text-muted">
        Unit {unit.index}: {unit.name}
      </p>
      {lesson.needs.length > 0 && (
        <>
          <div className="text-sm font-bold text-muted">Needs</div>
          {lesson.needs.map((n) => row(lessons[n]))}
        </>
      )}
      {unlockedBy(lesson.index).length > 0 && (
        <>
          <div className="mt-4 text-sm font-bold text-muted">Unlocks</div>
          {unlockedBy(lesson.index).map(row)}
        </>
      )}
      <div className="mt-4 text-sm font-bold text-muted">Teaches</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {lesson.items.map((id) => {
          const it = items[id]
          const s = itemState(it, memory)
          return (
            <Pill key={id} tone={s === 'stable' ? 'moss' : s === 'learning' ? 'sun' : 'neutral'}>
              {it.kind === 'pattern' ? it.title : it.text}
            </Pill>
          )
        })}
      </div>
      {state === 'ready' && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {chosen === lesson.index ? (
            <Link to="/" className="rounded-2xl bg-fjord px-6 py-3.5 text-lg font-bold text-white no-underline">
              Go to Today
            </Link>
          ) : (
            <Button onClick={() => void updateMeta({ chosenLesson: lesson.index })}>Learn this next</Button>
          )}
          {chosen === lesson.index && <span className="text-muted">This lesson is next.</span>}
        </div>
      )}
    </Card>
  )
}

function MapPage() {
  const { memory, meta } = useApp()
  const { pos, width, height } = useMemo(layout, [])
  const upNext = nextLesson(memory, meta.chosenLesson)
  const [selected, setSelected] = useState<number>(upNext?.index ?? 0)
  const lesson = lessons[selected]
  const scroller = useRef<HTMLDivElement>(null)

  // The graph is tall, and wider than a phone screen: open it on the lesson that comes next.
  useEffect(() => {
    // Wait until the router has restored its own scroll position, which would otherwise undo this.
    const t = setTimeout(() => scroller.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'center', inline: 'center' }), 150)
    return () => clearTimeout(t)
  }, [])

  return (
    <Shell>
      <div className="flex flex-col gap-7 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Heading title="Map" sub="What you know, and what it unlocks." />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {(['done', 'started', 'ready', 'locked'] as const).map((s) => (
              <span key={s} className="flex items-center gap-2">
                <span className={`h-4 w-4 rounded border ${LOOK[s].box}`} />
                {LOOK[s].label}
              </span>
            ))}
          </div>
          <div ref={scroller} className="overflow-x-auto rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <div className="relative mx-auto" style={{ width, height }}>
              <svg width={width} height={height} className="absolute top-0 left-0" aria-hidden>
                {lessons.flatMap((l) =>
                  l.needs.map((n) => {
                    const a = pos.get(n)!
                    const b = pos.get(l.index)!
                    const x1 = a.x + NODE_W / 2
                    const y1 = a.y + NODE_H
                    const x2 = b.x + NODE_W / 2
                    const near = l.index === selected || n === selected
                    return (
                      <path
                        key={`${n}-${l.index}`}
                        d={`M${x1} ${y1} C${x1} ${y1 + 26}, ${x2} ${b.y - 26}, ${x2} ${b.y}`}
                        fill="none"
                        stroke={near ? '#1e5a62' : '#cfc8ba'}
                        strokeWidth={near ? 2.5 : 1.5}
                      />
                    )
                  }),
                )}
              </svg>
              {lessons.map((l) => {
                const state = lessonState(l, memory)
                const Icon = ICON[state]
                const p = pos.get(l.index)!
                return (
                  <button
                    key={l.index}
                    type="button"
                    onClick={() => setSelected(l.index)}
                    aria-pressed={l.index === selected}
                    className={`absolute flex items-center justify-center gap-1.5 rounded-xl border px-2 text-sm leading-tight font-bold ${LOOK[state].box} ${
                      l.index === selected ? 'ring-[3px] ring-ink ring-offset-2 ring-offset-surface' : ''
                    }`}
                    style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                  >
                    <Icon size={15} className="shrink-0" />
                    <span>{l.title}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="w-full xl:sticky xl:top-8 xl:mt-[6.5rem] xl:w-[22rem] xl:shrink-0">
          <Detail lesson={lesson} memory={memory} chosen={meta.chosenLesson} />
        </div>
      </div>
    </Shell>
  )
}
