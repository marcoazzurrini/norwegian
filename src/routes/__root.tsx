import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { load, useApp } from '../engine/store'
import { Bare, SignIn } from '../components/SignIn'
import { startSync, useSync } from '../engine/sync'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Norsk' },
      { name: 'description', content: 'Learn Norwegian with spaced, compressed recall.' },
      { name: 'theme-color', content: '#212121' },
      { name: 'color-scheme', content: 'dark' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      // The app draws under the status bar, as in the design.
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'Norsk' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'manifest', href: '/manifest.webmanifest' },
      { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icon-192.png' },
    ],
  }),
  shellComponent: RootDocument,
  component: App,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** Loads the learner's data from this device before any page renders, and shows the sign-in screen until the learner is signed in. */
function App() {
  const { ready, meta } = useApp()
  const sync = useSync()

  useEffect(() => {
    void load().then(startSync)
    if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js')
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(meta.settings.textScale))
  }, [meta.settings.textScale])

  // `bun run dev` serves the app without the sign-in server, so it skips the sign-in screen.
  const open = sync.linked || import.meta.env.DEV
  if (!ready || (!open && !sync.checked)) return <Bare />
  if (!open) return <SignIn />
  return <Outlet />
}
