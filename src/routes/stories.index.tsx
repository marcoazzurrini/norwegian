import { Link, createFileRoute } from '@tanstack/react-router'
import { Lock } from 'lucide-react'
import { Shell } from '../components/Shell'
import { Card, Heading, Pill } from '../components/ui'
import { stories, units } from '../content'
import { storyReady } from '../engine/select'
import { useApp } from '../engine/store'

export const Route = createFileRoute('/stories/')({ component: StoriesPage })

function StoriesPage() {
  const { memory, meta } = useApp()
  return (
    <Shell>
      <div className="flex max-w-[44rem] flex-col gap-5">
        <Heading title="Stories" sub="Short texts made only from words you have learned." />
        <Card className="!py-1">
          {stories.map((st) => {
            const ready = storyReady(st, memory)
            const read = meta.storiesDone.includes(st.id)
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-bold">{st.title}</span>
                  <span className="block text-muted">
                    {st.titleEn} · Unit {st.unit}: {units[st.unit - 1].name}
                  </span>
                </span>
                {read ? <Pill tone="moss">Read</Pill> : ready ? <Pill>New</Pill> : <Lock size={20} className="text-muted" aria-label="Locked" />}
              </>
            )
            return ready ? (
              <Link key={st.id} to="/stories/$id" params={{ id: st.id }} className="flex items-center gap-4 border-t border-line py-4 text-ink no-underline first:border-t-0">
                {body}
              </Link>
            ) : (
              <div key={st.id} className="flex items-center gap-4 border-t border-line py-4 opacity-60 first:border-t-0">
                {body}
              </div>
            )
          })}
        </Card>
      </div>
    </Shell>
  )
}
