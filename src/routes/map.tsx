import { Link, createFileRoute } from '@tanstack/react-router'
import { Check, CircleDashed, Lock, Ruler, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '../components/Shell'
import { Blob, Button, Card, Label, PageTitle, Tag, buttonClass, useDesktop, type TagTone } from '../components/ui'
import { items, lessons, units, unlockedBy } from '../content'
import type { Lesson } from '../content/types'
import { itemState, lessonState, nextLesson, type LessonState, type Memory } from '../engine/select'
import { updateMeta, useApp } from '../engine/store'

export const Route = createFileRoute('/map')({ component: MapPage })

/** Sizes of the graph, in rem so the text size setting scales it. Slot is the width kept free for one lesson. */
const SIZES = {
  phone: { slot: 9.5, gap: 0.5, row: 5.75, node: 2.5 },
  desktop: { slot: 13.5, gap: 1, row: 8.5, node: 3.25 },
}

const LOOK: Record<LessonState, { label: string; tone: TagTone; icon: typeof Check; color: string }> = {
  done: { label: 'Learned', tone: 'good', icon: Check, color: 'text-green' },
  started: { label: 'In progress', tone: 'progress', icon: CircleDashed, color: 'text-orange' },
  ready: { label: 'Ready to learn', tone: 'new', icon: Sparkles, color: 'text-violet' },
  locked: { label: 'Locked', tone: 'neutral', icon: Lock, color: 'text-fg3' },
}

/** Places every lesson on a row one below its deepest need, so needs always point upward. Positions are in rem. */
function layout({ slot, gap, row, node }: (typeof SIZES)['phone']) {
  const depth: number[] = []
  for (const l of lessons) depth[l.index] = l.needs.length ? Math.max(...l.needs.map((n) => depth[n])) + 1 : 0
  const rows: Lesson[][] = []
  for (const l of lessons) (rows[depth[l.index]] ??= []).push(l)
  const widest = Math.max(...rows.map((r) => r.length))
  const width = widest * slot + (widest - 1) * gap
  const pos = new Map<number, { x: number; y: number }>()
  rows.forEach((r, d) => {
    const rowWidth = r.length * slot + (r.length - 1) * gap
    // x is the centre of the lesson's slot.
    r.forEach((l, i) => pos.set(l.index, { x: (width - rowWidth) / 2 + i * (slot + gap) + slot / 2, y: d * row }))
  })
  return { pos, width, height: (rows.length - 1) * row + node }
}

function Detail({ lesson, memory, chosen }: { lesson: Lesson; memory: Memory; chosen: number | null }) {
  const state = lessonState(lesson, memory)
  const unit = units[lesson.unit - 1]
  const row = (l: Lesson) => {
    const look = LOOK[lessonState(l, memory)]
    return (
      <div key={l.index} className="flex items-center justify-between gap-3 border-t border-line py-[0.6875rem] text-16 lg:py-4 lg:text-18">
        <span className="min-w-0">{l.title}</span>
        <Tag tone={look.tone}>{look.label}</Tag>
      </div>
    )
  }
  return (
    <Card className="lg:h-full lg:overflow-y-auto lg:!p-8">
      <div className="flex items-center gap-3.5 pb-3.5 lg:gap-[1.125rem] lg:pb-6">
        <Blob kind="map" className="size-11 lg:size-16" />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-20 leading-[1.15] font-medium tracking-[-0.02em] lg:text-28">{lesson.title}</h2>
          <p className="m-0 text-15 text-fg2 lg:text-18">
            Unit {unit.index}: {unit.name}
          </p>
        </div>
        <Tag tone={LOOK[state].tone} className="lg:hidden">
          {LOOK[state].label}
        </Tag>
      </div>
      <div className="hidden pb-2 lg:flex">
        <Tag tone={LOOK[state].tone}>{LOOK[state].label}</Tag>
      </div>
      {lesson.needs.length > 0 && (
        <>
          <Label className="py-2">Needs</Label>
          {lesson.needs.map((n) => row(lessons[n]))}
        </>
      )}
      {unlockedBy(lesson.index).length > 0 && (
        <>
          <Label className="pt-4 pb-2 lg:pt-7">Unlocks</Label>
          {unlockedBy(lesson.index).map(row)}
        </>
      )}
      <Label className="pt-4 pb-2 lg:pt-7">Teaches</Label>
      <div className="flex flex-wrap gap-2 pt-1">
        {lesson.items.map((id) => {
          const it = items[id]
          const s = itemState(it, memory)
          return it.kind === 'pattern' ? (
            <Tag key={id} icon={Ruler}>
              {it.title}
            </Tag>
          ) : (
            <Tag key={id} tone={s === 'stable' ? 'good' : s === 'learning' ? 'progress' : s === 'ready' ? 'new' : 'neutral'}>
              {it.text}
            </Tag>
          )
        })}
      </div>
      {state === 'ready' && (
        <>
          <div className="min-h-3.5 flex-1 lg:min-h-4" />
          {chosen === lesson.index ? (
            <div className="flex flex-col gap-2.5">
              <span className="text-center text-14 text-fg2 lg:text-16">This lesson is next.</span>
              <Link to="/" className={buttonClass('primary', 'large', 'w-full')}>
                Go to Today
              </Link>
            </div>
          ) : (
            <Button className="w-full" onClick={() => void updateMeta({ chosenLesson: lesson.index })}>
              Learn this next
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

function MapPage() {
  const { memory, meta } = useApp()
  const desktop = useDesktop()
  const size = desktop ? SIZES.desktop : SIZES.phone
  const { pos, width, height } = useMemo(() => layout(size), [size])
  const upNext = nextLesson(memory, meta.chosenLesson)
  const [selected, setSelected] = useState<number>(upNext?.index ?? 0)
  const lesson = lessons[selected]
  const scroller = useRef<HTMLDivElement>(null)

  // The graph is larger than its frame: open it on the lesson that comes next.
  useEffect(() => {
    // Wait until the router has restored its own scroll position, which would otherwise undo this.
    const t = setTimeout(() => {
      const box = scroller.current
      const node = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!box || !node) return
      const a = box.getBoundingClientRect()
      const b = node.getBoundingClientRect()
      box.scrollTo({ left: box.scrollLeft + b.left - a.left - (a.width - b.width) / 2, top: box.scrollTop + b.top - a.top - (a.height - b.height) / 2 })
    }, 150)
    return () => clearTimeout(t)
  }, [desktop])

  return (
    <Shell width="lg:max-w-none" fill>
      <PageTitle title="Map" sub="What you know, and what it unlocks.">
        <div className="hidden flex-wrap gap-2.5 lg:flex">
          {(['done', 'started', 'ready', 'locked'] as const).map((s) => (
            <Tag key={s} tone={LOOK[s].tone}>
              {LOOK[s].label}
            </Tag>
          ))}
        </div>
      </PageTitle>
      <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_32.5rem] lg:grid-rows-[minmax(0,1fr)]">
        <div ref={scroller} className="no-scrollbar h-[18.75rem] overflow-auto rounded-[1.25rem] border border-line bg-inset p-5 lg:h-auto lg:rounded-[2rem] lg:p-8">
          {/* Lengths are in rem; the SVG uses the same numbers as its own units. */}
          <div className="relative m-auto" style={{ width: `${width}rem`, height: `${height}rem` }}>
            <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full" aria-hidden>
              {lessons.flatMap((l) =>
                l.needs.map((n) => {
                  const a = pos.get(n)!
                  const b = pos.get(l.index)!
                  const y1 = a.y + size.node
                  const bend = (b.y - y1) / 2
                  const near = l.index === selected || n === selected
                  return <path key={`${n}-${l.index}`} d={`M${a.x} ${y1} C${a.x} ${y1 + bend}, ${b.x} ${b.y - bend}, ${b.x} ${b.y}`} fill="none" stroke={near ? '#F2F2F2' : '#3A3A3A'} strokeWidth={near ? 2 : 1.5} vectorEffect="non-scaling-stroke" />
                }),
              )}
            </svg>
            {lessons.map((l) => {
              const state = lessonState(l, memory)
              const { icon: Icon, color } = LOOK[state]
              const p = pos.get(l.index)!
              const on = l.index === selected
              return (
                <button
                  key={l.index}
                  type="button"
                  onClick={() => setSelected(l.index)}
                  aria-pressed={on}
                  title={l.title}
                  className={`press absolute inline-flex -translate-x-1/2 items-center gap-[0.4375rem] rounded-full pr-3.5 pl-[0.6875rem] text-13 font-medium whitespace-nowrap lg:gap-2.5 lg:pr-[1.375rem] lg:pl-4 lg:text-17 ${
                    on ? 'border-0 bg-inverse text-on-inverse' : state === 'locked' ? 'border border-dashed border-strong bg-inset text-fg2' : 'border-0 bg-raised text-fg'
                  }`}
                  style={{ left: `${p.x}rem`, top: `${p.y}rem`, height: `${size.node}rem`, maxWidth: `${size.slot}rem` }}
                >
                  <Icon className={`size-3.5 shrink-0 lg:size-[1.125rem] ${on ? '' : color}`} />
                  <span className="truncate">{l.title}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="lg:min-h-0">
          <Detail lesson={lesson} memory={memory} chosen={meta.chosenLesson} />
        </div>
      </div>
    </Shell>
  )
}
