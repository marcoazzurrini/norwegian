import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Shell } from '../components/Shell'
import { AudioButton, Bar, Card, Heading, Pill } from '../components/ui'
import { items, lessons, sentencesWith, units } from '../content'
import type { Item } from '../content/types'
import { retrievability } from '../engine/memory'
import { itemState, sentenceReady, type ItemState } from '../engine/select'
import { getScheduler, useApp } from '../engine/store'

export const Route = createFileRoute('/items')({ component: ItemsPage })

const STATE: Record<ItemState, { label: string; tone: 'moss' | 'sun' | 'fjord' | 'neutral' }> = {
  stable: { label: 'Stable', tone: 'moss' },
  learning: { label: 'Learning', tone: 'sun' },
  ready: { label: 'Ready', tone: 'fjord' },
  locked: { label: 'Locked', tone: 'neutral' },
}
const TONE_NAME = { 1: 'Melody 1: low, then rising', 2: 'Melody 2: dips, then rises' }

function ItemDetail({ it }: { it: Item }) {
  const { memory } = useApp()
  const m = memory.get(it.id)
  const examples = sentencesWith(it.id)
    .filter((s) => sentenceReady(s, memory))
    .slice(0, 4)
  const recall = m ? retrievability(getScheduler(), m, Date.now()) : 0
  const due = m ? new Date(m.card.dueAt) : null
  return (
    <Card>
      <div className="flex items-center gap-4">
        {it.kind !== 'pattern' && <AudioButton text={it.text} size={52} />}
        <div className="min-w-0">
          <div className="text-3xl leading-tight font-bold">{it.display}</div>
          {it.kind !== 'pattern' && <div className="text-lg text-muted">{it.gloss}</div>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <Pill tone={STATE[itemState(it, memory)].tone}>{STATE[itemState(it, memory)].label}</Pill>
        {it.ipa && <span className="text-muted">/{it.ipa.replace(/ˈ/g, '')}/</span>}
        {it.tone && <span className="text-muted">{TONE_NAME[it.tone]}</span>}
      </div>

      {it.forms && it.forms.length > 1 && (
        <div className="mt-5">
          <div className="text-sm font-bold text-muted">Forms</div>
          {it.forms.map((f) => (
            <div key={f.label} className="flex justify-between border-t border-line py-2">
              <span className="text-muted">{f.label}</span>
              <span className="font-bold">{f.form}</span>
            </div>
          ))}
        </div>
      )}

      {it.rule && (
        <div className="mt-5">
          <div className="text-sm font-bold text-muted">The rule</div>
          {it.rule.map((r) => (
            <p key={r} className="m-0 mt-1.5">
              {r}
            </p>
          ))}
          {it.examples?.map((e) => (
            <div key={e.no} className="mt-2 border-t border-line pt-2">
              <span className="font-bold">{e.no.replace('>', '→')}</span> <span className="text-muted">{e.en}</span>
            </div>
          ))}
        </div>
      )}

      {m && (
        <div className="mt-5">
          <div className="text-sm font-bold text-muted">Memory</div>
          <div className="mt-2 flex items-center gap-3.5">
            <Bar value={recall} tone="moss" />
            <span className="font-bold">{Math.round(recall * 100)}%</span>
          </div>
          <p className="m-0 mt-1.5 text-muted">
            Chance you recall it now. Lasts about {m.card.stability < 1 ? 'less than a day' : `${Math.round(m.card.stability)} days`}.
            {due && ` Next review: ${due.getTime() <= Date.now() ? 'now' : due.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}.`}
          </p>
        </div>
      )}

      {examples.length > 0 && (
        <div className="mt-5">
          <div className="text-sm font-bold text-muted">Sentences you can read</div>
          {examples.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border-t border-line py-2.5">
              <AudioButton text={s.no} size={36} />
              <div>
                <div className="text-lg">{s.no}</div>
                <div className="text-muted">{s.en}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ItemsPage() {
  const { memory } = useApp()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const q = query.trim().toLowerCase()

  const groups = useMemo(
    () =>
      units.map((u) => ({
        unit: u,
        list: u.lessons
          .flatMap((li) => lessons[li].items)
          .map((id) => items[id])
          .filter((it) => !q || it.text.toLowerCase().includes(q) || it.gloss.toLowerCase().includes(q)),
      })),
    [q],
  )

  return (
    <Shell>
      <div className="flex flex-col gap-7 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Heading title="Items" sub={`${memory.size} of ${Object.keys(items).length} learned.`} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Norwegian or English"
            aria-label="Search items"
            className="w-full rounded-2xl border-2 border-line bg-surface px-5 py-3 text-lg outline-none focus:border-fjord"
          />
          {groups
            .filter((g) => g.list.length)
            .map(({ unit, list }) => (
              <section key={unit.index}>
                <h2 className="m-0 mb-2 text-xl font-bold">
                  Unit {unit.index}: {unit.name}
                </h2>
                <Card className="!py-1">
                  {list.map((it) => {
                    const s = itemState(it, memory)
                    return (
                      <div key={it.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(selected === it.id ? null : it.id)}
                          aria-expanded={selected === it.id}
                          className={`flex w-full items-center gap-3 border-0 border-t border-line bg-transparent px-0 py-3 text-left text-ink first:border-t-0 ${selected === it.id ? 'font-bold' : ''}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="text-lg">{it.kind === 'pattern' ? it.title : it.display}</span>
                            {it.kind !== 'pattern' && <span className="ml-3 font-normal text-muted">{it.gloss}</span>}
                          </span>
                          <Pill tone={STATE[s].tone}>{it.kind === 'pattern' ? 'Pattern' : STATE[s].label}</Pill>
                        </button>
                        {selected === it.id && (
                          <div className="pb-4 xl:hidden">
                            <ItemDetail it={it} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </Card>
              </section>
            ))}
        </div>
        <div className="hidden xl:sticky xl:top-8 xl:mt-[6.5rem] xl:block xl:w-[24rem] xl:shrink-0">
          {selected ? <ItemDetail it={items[selected]} /> : <Card className="text-muted">Choose an item to see its forms, sound and memory.</Card>}
        </div>
      </div>
    </Shell>
  )
}
