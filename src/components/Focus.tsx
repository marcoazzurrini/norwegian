import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Bar } from './ui'

interface FocusProps {
  label: string
  progress: number
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** One task per screen: progress on top, the task in a narrow column, the action at the bottom. */
export function Focus({ label, progress, onClose, children, footer }: FocusProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center gap-4 px-5 py-5 md:gap-6 md:px-10 md:py-6">
        <button type="button" onClick={onClose} aria-label="Close" className="border-0 bg-transparent p-1 text-muted">
          <X size={24} />
        </button>
        <Bar value={progress} className="!h-2" />
        <span className="shrink-0 text-muted">{label}</span>
      </header>
      <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col gap-5 px-5 py-4 md:gap-6 md:py-10">{children}</div>
      {footer && (
        <footer className="sticky bottom-0 border-t border-line bg-surface px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex w-full max-w-[46rem] flex-wrap items-center justify-between gap-3">{footer}</div>
        </footer>
      )}
    </div>
  )
}
