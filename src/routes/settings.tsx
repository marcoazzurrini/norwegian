import { createFileRoute } from '@tanstack/react-router'
import { Check, ChevronsUpDown, WifiOff } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Shell } from '../components/Shell'
import { Button, ListCard, PageTitle, Segmented } from '../components/ui'
import { exportData, updateSettings, useApp } from '../engine/store'
import { restoreBackup, signOut, startOver, syncNow, useSync } from '../engine/sync'
import { speak, useVoices } from '../lib/speech'

export const Route = createFileRoute('/settings')({ component: SettingsPage })

function Row({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-[1.375rem]">
      <div className="max-w-[32.5rem]">
        <div className="text-17 font-medium lg:text-20">{title}</div>
        {help && <div className="text-14 leading-[1.45] text-fg2 lg:text-16">{help}</div>}
      </div>
      <div className="max-w-full shrink-0">{children}</div>
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
    <Shell width="lg:max-w-[60rem]">
      <PageTitle title="Settings" />
      <div className="flex flex-col gap-5">
        <ListCard>
          <Row title="Session length" help="The length offered first on the Today screen.">
            <Segmented label="Session length" value={s.minutes} options={[5, 15, 25, 40].map((m) => [m, `${m} min`])} onPick={(minutes) => void updateSettings({ minutes })} />
          </Row>
          <Row title="Recall target" help="The share of reviews you should get right. Higher means more reviews.">
            <Segmented
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
            <Segmented
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
        </ListCard>

        <ListCard>
          <Row title="Voice" help={voices.length ? 'The Norwegian voice used for words and sentences.' : 'No Norwegian voice is installed on this device. Add one in the system settings.'}>
            {voices.length > 0 && (
              <div className="relative inline-flex max-w-full items-center">
                <select
                  value={s.voice ?? voices[0].voiceURI}
                  onChange={(e) => void updateSettings({ voice: e.target.value })}
                  aria-label="Voice"
                  className="press h-[2.625rem] max-w-full appearance-none rounded-full border-0 bg-control pr-10 pl-[1.125rem] text-15 font-medium text-fg"
                >
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <ChevronsUpDown className="pointer-events-none absolute right-3.5 size-4 text-fg3" />
              </div>
            )}
          </Row>
          <Row title="Speaking speed">
            <Segmented
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
        </ListCard>

        <ListCard>
          <div>
            <Row title="Account" help={`Signed in as ${sync.account}. This device shares its progress with your other signed-in devices.`}>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="small" onClick={() => void syncNow()}>
                  Sync now
                </Button>
                <Button variant="secondary" size="small" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </Row>
            <p className="m-0 flex items-center gap-2 pb-4 text-14 text-fg2 lg:pb-[1.375rem] lg:text-16" role="status">
              {sync.error ? <WifiOff className="size-4 shrink-0 text-red" /> : <Check className="size-4 shrink-0 text-green" />}
              {syncText}
            </p>
          </div>
        </ListCard>

        <ListCard>
          <Row title="Backup" help="Save a copy of your progress as a file. Restoring a file replaces the progress on every signed-in device.">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="small" onClick={() => void download()}>
                Save backup
              </Button>
              <Button variant="secondary" size="small" onClick={() => file.current?.click()}>
                Restore
              </Button>
              <input ref={file} type="file" accept="application/json" hidden onChange={(e) => void restore(e.target.files?.[0])} />
            </div>
          </Row>
          <Row title="Start over" help={`Deletes all progress on every signed-in device: ${memory.size} learned items.`}>
            {confirmReset ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" size="small" onClick={() => void startOver().then(() => (setConfirmReset(false), setMessage('All progress deleted.')))}>
                  Delete everything
                </Button>
                <Button variant="secondary" size="small" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="secondary" size="small" onClick={() => setConfirmReset(true)}>
                Start over
              </Button>
            )}
          </Row>
        </ListCard>
        {message && (
          <p className="m-0 flex items-center gap-2 text-14 text-fg2 lg:text-16" role="status">
            <Check className="size-4 shrink-0 text-green" />
            {message}
          </p>
        )}
      </div>
    </Shell>
  )
}
