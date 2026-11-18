import { CircleAlert } from 'lucide-react'
import { useState } from 'react'
import { signIn, useSync } from '../engine/sync'
import { Button } from './ui'

function GoogleMark() {
  return (
    <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
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

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-[26rem] flex-col gap-8 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-10">
        <div className="text-3xl font-bold text-fjord">norsk</div>
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-4xl leading-tight font-bold">Velkommen</h1>
          <p className="m-0 text-lg text-muted">Welcome. Sign in to start learning.</p>
        </div>
        {error && (
          <div className="flex gap-3 rounded-2xl bg-lingon-soft px-4 py-3.5" role="alert">
            <CircleAlert size={22} className="mt-0.5 shrink-0 text-lingon" />
            <div>
              <div className="font-bold text-lingon">{refused && !sync.error ? 'Sign-in failed' : 'Not signed in'}</div>
              <div>{error}</div>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3.5">
          <Button className="w-full" disabled={starting} onClick={() => void start()}>
            <GoogleMark />
            Sign in with Google
          </Button>
          <p className="m-0 text-muted">Your progress is saved to your account and follows you to every device.</p>
        </div>
      </div>
    </main>
  )
}
