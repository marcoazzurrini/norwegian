import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Blob, IconButton, Progress, type BlobKind } from './ui'

interface FocusProps {
  /** The activity, shown as a pill in the middle of the top bar. */
  block: BlobKind
  title: string
  /** Short text beside the progress bar, such as "12 min left". */
  label: string
  progress: number
  onClose: () => void
  children: ReactNode
  /** The composer or the buttons at the bottom. */
  dock?: ReactNode
  /** When this value changes, the exchange scrolls to its newest part. */
  scrollKey?: unknown
  /** A wider column, for the summary at the end of a session. */
  wide?: boolean
}

/** One task per screen: where you are on top, the exchange in a narrow column, the action at the bottom. */
export function Focus({ block, title, label, progress, onClose, children, dock, scrollKey, wide }: FocusProps) {
  const stage = useRef<HTMLDivElement>(null)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = stage.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [scrollKey])

  const column = wide ? 'lg:w-[65rem]' : 'lg:w-[55rem]'

  return (
    <div className="flex h-dvh flex-col bg-panel lg:bg-base lg:p-2.5">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel lg:rounded-3xl">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-[calc(max(env(safe-area-inset-top),0.5rem)+0.25rem)] pb-2 lg:px-6 lg:py-5">
          <div className="flex">
            <IconButton label="Close" onClick={onClose}>
              <X className="size-[1.125rem]" />
            </IconButton>
          </div>
          <div className="inline-flex h-9 items-center gap-2 rounded-full bg-control pr-3.5 pl-2 text-14 font-medium lg:h-11 lg:gap-2.5 lg:pr-[1.125rem] lg:pl-2.5 lg:text-16">
            <Blob kind={block} className="size-[1.375rem] lg:size-[1.625rem]" />
            {title}
          </div>
          <div className="flex items-center justify-end gap-3.5 pr-0.5 lg:pr-2">
            <Progress value={progress} className="hidden !h-1 w-40 lg:block" />
            <span className="text-13 font-medium whitespace-nowrap text-fg2 lg:text-15">{label}</span>
          </div>
        </header>
        <div className="px-4 lg:hidden">
          <Progress value={progress} className="!h-[3px]" />
        </div>

        <div ref={stage} className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className={`mx-auto flex min-h-full w-full max-w-full flex-col justify-center gap-2.5 px-4 py-3 lg:gap-3.5 lg:px-0 lg:py-4 ${column}`}>{children}</div>
        </div>

        <footer className={`mx-auto w-full max-w-full px-4 pt-3 pb-[max(calc(env(safe-area-inset-bottom)+0.5rem),1rem)] lg:min-h-[7.75rem] lg:px-0 lg:pt-5 lg:pb-12 ${column}`}>{dock}</footer>
      </div>
    </div>
  )
}

/** Two actions at the bottom: the quieter one on the left, the main one on the right. On a phone they share the width. */
export function DockRow({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-3 *:flex-1 lg:gap-4 lg:*:flex-none">{children}</div>
}

/** A short note with the main action. On a phone the note sits above a full-width button. */
export function DockHint({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
      <span className="text-center text-14 text-fg2 lg:text-left lg:text-16">{hint}</span>
      {children}
    </div>
  )
}
