import { Link, useRouterState } from '@tanstack/react-router'
import { BookOpen, Ear, Library, Settings, Sun, Waypoints } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSync } from '../engine/sync'

const NAV = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/map', label: 'Map', icon: Waypoints },
  { to: '/stories', label: 'Stories', icon: BookOpen },
  { to: '/sounds', label: 'Sounds', icon: Ear },
  { to: '/items', label: 'Items', icon: Library },
] as const

/** A short name and initials from the part of the email address before the @. */
function nameOf(account: string | null): { name: string; initials: string } {
  const parts = (account ?? '').split('@')[0].split(/[^a-zA-Z]+/).filter(Boolean)
  if (!parts.length) return { name: 'Account', initials: '' }
  return { name: parts[0][0].toUpperCase() + parts[0].slice(1), initials: (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase() }
}

interface ShellProps {
  children: ReactNode
  /** Width of the content column on a wide screen. */
  width?: string
  /** The page fills the window and scrolls inside its own parts, instead of scrolling as a whole. */
  fill?: boolean
}

/** Page frame: a sidebar beside a rounded panel on a wide screen; a header and a floating tab bar on a phone. */
export function Shell({ children, width = 'lg:max-w-[80rem]', fill }: ShellProps) {
  const onSettings = useRouterState({ select: (s) => s.location.pathname === '/settings' })
  const { name, initials } = nameOf(useSync().account)

  return (
    <div className="flex min-h-dvh flex-col bg-panel lg:h-dvh lg:flex-row lg:bg-base lg:p-2.5">
      <nav className="hidden w-[18.75rem] shrink-0 flex-col gap-1 px-3.5 pt-[1.375rem] pb-3.5 lg:flex" aria-label="Main">
        <div className="px-3.5 pt-1 pb-7 text-26 font-medium tracking-[-0.03em]">norsk</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="press flex h-[2.875rem] items-center gap-3.5 rounded-xl px-3.5 text-16 text-fg2 no-underline"
            activeProps={{ className: 'bg-raised font-medium !text-fg' }}
            activeOptions={{ exact: to === '/' }}
          >
            <Icon className="size-5 shrink-0" />
            {label}
          </Link>
        ))}
        <div className="flex-1" />
        <Link to="/settings" aria-label="Settings" className={`press flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-fg no-underline ${onSettings ? 'bg-raised' : ''}`}>
          <span className="flex size-8 items-center justify-center rounded-full bg-control text-12 font-medium text-fg2">{initials}</span>
          <span className="min-w-0 flex-1 truncate text-15 font-medium">{name}</span>
          <Settings className={`size-[1.125rem] ${onSettings ? 'text-fg' : 'text-fg3'}`} />
        </Link>
      </nav>

      <header className="flex items-center justify-between px-5 pt-[calc(max(env(safe-area-inset-top),0.5rem)+0.375rem)] lg:hidden">
        <span className="text-22 font-medium tracking-[-0.03em]">norsk</span>
        <Link to="/settings" aria-label="Settings" className={`press flex size-9 items-center justify-center rounded-full ${onSettings ? 'bg-inverse text-on-inverse' : 'bg-control text-fg2'}`}>
          <Settings className="size-[1.0625rem]" />
        </Link>
      </header>

      <main className={`flex min-w-0 flex-1 flex-col items-center px-4 pt-5 pb-36 lg:rounded-3xl lg:bg-panel lg:px-[4.5rem] lg:pt-[4.5rem] ${fill ? 'lg:overflow-hidden lg:pb-14' : 'lg:overflow-y-auto lg:pb-[4.5rem]'}`}>
        <div className={`flex w-full flex-col gap-5 lg:gap-11 ${fill ? 'lg:min-h-0 lg:flex-1' : ''} ${width}`}>{children}</div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[9.375rem] bg-linear-to-t from-panel from-45% to-transparent lg:hidden" />
      <nav className="fixed inset-x-0 bottom-[max(0.875rem,calc(env(safe-area-inset-bottom)-0.25rem))] flex justify-center lg:hidden" aria-label="Main">
        <div className="inline-flex gap-0.5 rounded-full border border-line bg-base p-1.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="press flex h-[3.25rem] w-16 flex-col items-center justify-center gap-[3px] rounded-full text-11 font-medium text-fg2 no-underline"
              activeProps={{ className: 'bg-raised !text-fg' }}
              activeOptions={{ exact: to === '/' }}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}
