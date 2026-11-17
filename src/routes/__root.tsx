import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { load, useApp } from '../engine/store'
import { startSync } from '../engine/sync'
import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Norsk' },
      { name: 'description', content: 'Learn Norwegian with spaced, compressed recall.' },
      { name: 'theme-color', content: '#f5f2ec' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
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

/** Loads the learner's data from this device before any page renders. */
function App() {
  const { ready, meta } = useApp()

  useEffect(() => {
    void load().then(startSync)
    if ('serviceWorker' in navigator && import.meta.env.PROD) void navigator.serviceWorker.register('/sw.js')
  }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(meta.settings.textScale))
  }, [meta.settings.textScale])

  if (!ready) return <div className="flex min-h-dvh items-center justify-center text-2xl font-bold text-fjord">norsk</div>
  return <Outlet />
}
