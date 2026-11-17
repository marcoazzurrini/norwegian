import { Link } from '@tanstack/react-router'
import { BookOpen, Ear, Library, Network, Settings, Sun } from 'lucide-react'
import type { ReactNode } from 'react'

const NAV = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/map', label: 'Map', icon: Network },
  { to: '/stories', label: 'Stories', icon: BookOpen },
  { to: '/sounds', label: 'Sounds', icon: Ear },
  { to: '/items', label: 'Items', icon: Library },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

/** Page frame: sidebar on wide screens, tab bar on a phone. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <nav className="hidden w-60 shrink-0 flex-col gap-1.5 border-r border-line px-4 py-7 md:flex" aria-label="Main">
        <div className="px-3.5 pb-6 text-2xl font-bold text-fjord">norsk</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-ink no-underline"
            activeProps={{ className: 'bg-fjord-soft font-bold !text-fjord' }}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
      <main className="min-w-0 flex-1 px-5 pt-8 pb-28 md:px-12 md:pt-12 md:pb-12">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface px-2 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 flex-col items-center gap-1 text-xs text-muted no-underline"
            activeProps={{ className: 'font-bold !text-fjord' }}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon size={24} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
