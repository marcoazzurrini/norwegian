import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState, type ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Button, Card, Heading } from '../components/ui'
import { exportData, updateSettings, useApp } from '../engine/store'
import { restoreBackup, signIn, signOut, startOver, syncNow, useSync } from '../engine/sync'
import { speak, useVoices } from '../lib/speech'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function Row({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t border-line py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-[26rem]">
        <div className="text-lg font-bold">{title}</div>
        {help && <div className="text-muted">{help}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Options<T extends string | number>({ value, options, onPick, label }: { value: T; options: Array<[T, string]>; onPick: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={v === value}
          onClick={() => onPick(v)}
          className={`rounded-xl border-2 px-3.5 py-2 ${v === value ? 'border-fjord bg-fjord-soft font-bold text-fjord' : 'border-line bg-surface text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function SettingsPage() {
  const { meta, memory } = useApp()
  const s = meta.settings
  const voices = useVoices()
  const file = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const sync = useSync()
  // Google sends the browser back here with ?error=... if the sign-in failed or the account is not allowed.
  const [signInFailed] = useState(() => new URLSearchParams(window.location.search).has('error'))
  const syncText = sync.error ?? (sync.busy ? 'Syncing now.' : sync.lastOkAt ? `Last synced at ${new Date(sync.lastOkAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Not synced yet.')

  const download = async () => {
    const blob = new Blob([await exportData()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `norsk-backup-${new Date().toLocaleDateString('sv-SE')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const restore = async (f: File | undefined) => {
    if (!f) return
    try {
      await restoreBackup(await f.text())
      setMessage('Backup restored.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'The file could not be read.')
    }
  }

  return (
    <Shell>
      <div className="flex max-w-[46rem] flex-col gap-5">
        <Heading title="Settings" />
        <Card className="!py-2">
          <Row title="Session length" help="The length offered first on the Today screen.">
            <Options label="Session length" value={s.minutes} options={[5, 15, 25, 40].map((m) => [m, `${m} min`])} onPick={(minutes) => void updateSettings({ minutes })} />
          </Row>
          <Row title="Recall target" help="The share of reviews you should get right. Higher means more reviews.">
            <Options
              label="Recall target"
              value={s.desiredRetention}
              options={[
                [0.85, '85%'],
                [0.9, '90%'],
                [0.92, '92%'],
              ]}
              onPick={(desiredRetention) => void updateSettings({ desiredRetention })}
            />
          </Row>
          <Row title="Text size">
            <Options
              label="Text size"
              value={s.textScale}
              options={[
                [0.9, 'Small'],
                [1, 'Normal'],
                [1.15, 'Large'],
                [1.3, 'Larger'],
              ]}
              onPick={(textScale) => void updateSettings({ textScale })}
            />
          </Row>
        </Card>

        <Card className="!py-2">
          <Row title="Voice" help={voices.length ? 'The Norwegian voice used for words and sentences.' : 'No Norwegian voice is installed on this device. Add one in the system settings.'}>
            {voices.length > 0 && (
              <select
                value={s.voice ?? voices[0].voiceURI}
                onChange={(e) => void updateSettings({ voice: e.target.value })}
                aria-label="Voice"
                className="max-w-full rounded-xl border-2 border-line bg-surface px-3 py-2 text-lg"
              >
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </Row>
          <Row title="Speaking speed">
            <Options
              label="Speaking speed"
              value={s.rate}
              options={[
                [0.7, 'Slow'],
                [0.9, 'Normal'],
                [1, 'Fast'],
              ]}
              onPick={(rate) => void updateSettings({ rate }).then(() => speak('Hei! Hvordan går det?'))}
            />
          </Row>
        </Card>

        <Card className="!py-2">
          {sync.linked ? (
            <Row title="Sync" help={`Signed in as ${sync.account}. This device shares its progress with your other signed-in devices.`}>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" className="!px-4 !py-2" onClick={() => void syncNow()}>
                  Sync now
                </Button>
                <Button variant="secondary" className="!px-4 !py-2" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </Row>
          ) : (
            <Row title="Sync" help="Sign in on each device to share progress between them.">
              <Button variant="secondary" className="!px-4 !py-2" onClick={() => void signIn()}>
                Sign in with Google
              </Button>
            </Row>
          )}
          {(sync.linked || sync.error || signInFailed) && (
            <p className={`m-0 pb-4 font-bold ${sync.error || !sync.linked ? 'text-lingon' : 'text-muted'}`} role="status">
              {sync.linked || sync.error ? syncText : 'Sign-in failed. This Google account may not use this app.'}
            </p>
          )}
        </Card>

        <Card className="!py-2">
          <Row title="Backup" help={sync.linked ? 'Save a copy of your progress as a file. Restoring a file replaces the progress on every signed-in device.' : 'Your progress is stored only on this device. Save a file to keep a copy.'}>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="!px-4 !py-2" onClick={() => void download()}>
                Save backup
              </Button>
              <Button variant="secondary" className="!px-4 !py-2" onClick={() => file.current?.click()}>
                Restore
              </Button>
              <input ref={file} type="file" accept="application/json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
            </div>
          </Row>
          <Row title="Start over" help={`Deletes all progress on ${sync.linked ? 'every signed-in device' : 'this device'}: ${memory.size} learned items.`}>
            {confirmReset ? (
              <div className="flex flex-wrap gap-2">
                <Button className="!bg-lingon !px-4 !py-2" onClick={() => void startOver().then(() => (setConfirmReset(false), setMessage('All progress deleted.')))}>
                  Delete everything
                </Button>
                <Button variant="secondary" className="!px-4 !py-2" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="!px-4 !py-2" onClick={() => setConfirmReset(true)}>
                Start over
              </Button>
            )}
          </Row>
        </Card>
        {message && (
          <p className="m-0 font-bold text-fjord" role="status">
            {message}
          </p>
        )}
      </div>
    </Shell>
  )
}
