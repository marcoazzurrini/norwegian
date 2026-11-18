import { X } from 'lucide-react'
import { useState } from 'react'
import { signIn, useSync } from '../engine/sync'
import { Button, Chip } from './ui'

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[1.125rem] shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** The frame shared by the sign-in screen and the short wait before it: the app's name on an empty panel. */
export function Bare({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-panel lg:h-dvh lg:bg-base lg:p-2.5">
      <main className="flex flex-1 flex-col bg-panel lg:rounded-3xl">
        <div className="px-5 pt-[calc(max(env(safe-area-inset-top),0.5rem)+0.375rem)] text-22 font-medium tracking-[-0.03em] lg:px-9 lg:py-7 lg:text-26">norsk</div>
        {children}
      </main>
    </div>
  )
}

/** The only screen a signed-out device can see. */
export function SignIn() {
  const sync = useSync()
  const [starting, setStarting] = useState(false)
  // Google sends the browser back with ?error=... if the sign-in failed or the account is not allowed.
  const [refused] = useState(() => new URLSearchParams(window.location.search).has('error'))
  const error = sync.error ?? (refused ? 'This Google account may not use this app.' : null)

  const start = async () => {
    setStarting(true)
    await signIn()
    // On success the browser leaves for Google; this line only matters if the sign-in could not start.
    setStarting(false)
  }

  const failure = error && (
    <div className="flex items-start gap-3 rounded-[1.25rem] border border-line bg-inset px-4 py-3.5 text-left lg:items-center lg:px-5" role="alert">
      <X className="mt-0.5 size-[1.125rem] shrink-0 text-red lg:mt-0 lg:size-5" />
      <div>
        <div className="text-16 font-medium">{refused && !sync.error ? 'Sign-in failed' : 'Not signed in'}</div>
        <div className="text-14 leading-[1.45] text-fg2">{error}</div>
      </div>
    </div>
  )
  const button = (
    <Button className="w-full lg:w-auto" disabled={starting} onClick={() => void start()}>
      <GoogleMark />
      Sign in with Google
    </Button>
  )
  const note = <p className="m-0 text-center text-14 leading-[1.45] text-fg3 lg:text-16">Your progress is saved to your account and follows you to every device.</p>

  return (
    <Bare>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center lg:gap-7 lg:px-0 lg:pb-[7.5rem]">
        <Chip strong="Norsk.">Norwegian by recall</Chip>
        <h1 className="m-0 text-display leading-none font-medium tracking-[-0.035em]">Velkommen</h1>
        <p className="m-0 text-17 text-fg2 lg:text-22">Welcome. Sign in to start learning.</p>
        {/* On a wide screen the action sits with the greeting; on a phone it sits at the bottom, under the thumb. */}
        <div className="hidden flex-col items-center gap-7 lg:flex">
          {failure}
          <div className="pt-3">{button}</div>
          {note}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-4 pt-3 pb-[max(calc(env(safe-area-inset-bottom)+0.5rem),1rem)] lg:hidden">
        {failure}
        {button}
        {note}
      </div>
    </Bare>
  )
}
