import { Link, createFileRoute } from '@tanstack/react-router'
import { BookOpen, Ear, Play, Repeat, Sparkles } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Bar, Card, Heading } from '../components/ui'
import { items, units } from '../content'
import { isStable, retrievability } from '../engine/memory'
import { compression, dueItems, nextLesson, nextStory } from '../engine/select'
import { getScheduler, updateSettings, useApp } from '../engine/store'

export const Route = createFileRoute('/')({ component: Today })

/** Hours a solo learner needs to reach A1 (docs/spec.md, section 4). */
const HOURS_TO_A1 = 100
const LENGTHS = [5, 15, 25, 40]

function greeting(): [string, string] {
  const h = new Date().getHours()
  if (h < 10) return ['God morgen', 'Good morning']
  if (h < 18) return ['God dag', 'Good day']
  return ['God kveld', 'Good evening']
}

function Block({ icon, title, line, strong }: { icon: ReactNode; title: string; line: string; strong?: string }) {
  return (
    <div className="flex items-start gap-4 border-t border-line py-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-fjord-soft text-fjord">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold">{title}</div>
        <div className="text-muted">{line}</div>
        {strong && <div className="font-bold text-fjord">{strong}</div>}
      </div>
    </div>
  )
}

function Today() {
  const { memory, meta } = useApp()
  const minutes = meta.settings.minutes
  const [no, en] = greeting()

  const view = useMemo(() => {
    const now = Date.now()
    const scheduler = getScheduler()
    const mems = [...memory.values()]
    const lesson = nextLesson(memory, meta.chosenLesson)
    const first = lesson?.items.find((id) => !memory.has(id))
    return {
      comp: compression(memory, now),
      learning: dueItems(memory, now).learning.length,
      lesson,
      firstNew: first ? items[first] : null,
      story: nextStory(memory, new Set(meta.storiesDone)),
      stable: mems.filter(isStable).length,
      inLearning: mems.filter((m) => !isStable(m)).length,
      recall: mems.length ? mems.reduce((sum, m) => sum + retrievability(scheduler, m, now), 0) / mems.length : 0,
    }
  }, [memory, meta.chosenLesson, meta.storiesDone])

  const hours = meta.totalMs / 3_600_000
  const total = Object.keys(items).length
  const due = view.comp.due + view.learning

  return (
    <Shell>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex max-w-[40rem] flex-1 flex-col gap-7">
          <Heading title={no} sub={`${en}.${meta.days.length ? ` Day ${meta.days.length}.` : ''}`} />
          <Card className="!pb-2">
            <div className="text-2xl font-bold">Today's session</div>
            <div className="text-muted">Choose a length. You can stop at any time.</div>
            <div className="my-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Session length">
              {LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={m === minutes}
                  onClick={() => void updateSettings({ minutes: m })}
                  className={`rounded-xl border-2 py-2.5 text-lg ${m === minutes ? 'border-fjord bg-fjord-soft font-bold text-fjord' : 'border-line bg-surface text-ink'}`}
                >
                  {m} min
                </button>
              ))}
            </div>
            <Link
              to="/session"
              search={{ minutes }}
              className="mb-4 flex items-center justify-center gap-2.5 rounded-2xl bg-fjord py-4 text-xl font-bold text-white no-underline"
            >
              <Play size={20} /> Start
            </Link>
            {minutes >= 15 && <Block icon={<Ear size={22} />} title="Sounds" line="Two similar words. Which one do you hear?" />}
            <Block
              icon={<Repeat size={22} />}
              title="Review"
              line={due ? `${due} ${due === 1 ? 'item is' : 'items are'} due.` : 'Nothing is due.'}
              strong={view.comp.due > 1 && view.comp.tasks < view.comp.due ? `${view.comp.tasks} reviews cover ${view.comp.due} of them.` : undefined}
            />
            <Block
              icon={<Sparkles size={22} />}
              title="New"
              line={view.lesson ? `Unit ${view.lesson.unit}, ${units[view.lesson.unit - 1].name}: ${view.lesson.title}.` : 'You have learned every lesson.'}
              strong={view.firstNew ? (view.firstNew.kind === 'pattern' ? `Pattern: ${view.firstNew.title}` : `Next: ${view.firstNew.display}`) : undefined}
            />
            {minutes >= 15 && (
              <Block icon={<BookOpen size={22} />} title="Story" line={view.story ? `${view.story.title}. Made from words you know.` : 'A story unlocks after a few more lessons.'} />
            )}
          </Card>
        </div>

        <div className="flex w-full flex-col gap-5 lg:mt-[6.5rem] lg:w-96 lg:shrink-0">
          <Card>
            <div className="text-lg font-bold">Progress to A1</div>
            <div className="mt-3 mb-1.5 flex items-center gap-3.5">
              <Bar value={hours / HOURS_TO_A1} />
              <span className="font-bold">{Math.round((hours / HOURS_TO_A1) * 100)}%</span>
            </div>
            <div className="text-muted">
              {hours.toFixed(1)} of about {HOURS_TO_A1} hours
            </div>
          </Card>
          <Card>
            <div className="mb-3 text-lg font-bold">Items</div>
            <div className="flex gap-3">
              {[
                [view.stable, 'Stable', 'text-moss'],
                [view.inLearning, 'Learning', 'text-sun'],
                [total - memory.size, 'To learn', 'text-fjord'],
              ].map(([n, label, color]) => (
                <div key={label} className="flex-1">
                  <div className={`text-3xl leading-tight font-bold ${color}`}>{n}</div>
                  <div className="text-muted">{label}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <div className="mb-3 text-lg font-bold">Memory</div>
            <div className="flex items-center gap-3.5">
              <Bar value={view.recall} tone="moss" />
              <span className="font-bold">{Math.round(view.recall * 100)}%</span>
            </div>
            <div className="mt-1.5 text-muted">Share of learned items you would recall right now.</div>
          </Card>
        </div>
      </div>
    </Shell>
  )
}
