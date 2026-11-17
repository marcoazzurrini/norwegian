import { Volume2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { speak } from '../lib/speech'

type Tone = 'fjord' | 'moss' | 'sun' | 'lingon' | 'neutral'

const SOFT: Record<Tone, string> = {
  fjord: 'bg-fjord-soft text-fjord',
  moss: 'bg-moss-soft text-moss',
  sun: 'bg-sun-soft text-sun',
  lingon: 'bg-lingon-soft text-lingon',
  neutral: 'bg-paper text-muted border border-line',
}
const TEXT: Record<Tone, string> = { fjord: 'text-fjord', moss: 'text-moss', sun: 'text-sun', lingon: 'text-lingon', neutral: 'text-muted' }
const FILL: Record<Tone, string> = { fjord: 'bg-fjord', moss: 'bg-moss', sun: 'bg-sun', lingon: 'bg-lingon', neutral: 'bg-muted' }

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface p-5 sm:p-6 ${className}`}>{children}</div>
}

export function Pill({ children, tone = 'fjord' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${SOFT[tone]}`}>{children}</span>
}

export function Bar({ value, tone = 'fjord', className = '' }: { value: number; tone?: Tone; className?: string }) {
  return (
    <div className={`h-2.5 flex-1 overflow-hidden rounded-full bg-line ${className}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  hint?: string
}

export function Button({ variant = 'primary', hint, children, className = '', ...rest }: ButtonProps) {
  const look =
    variant === 'primary'
      ? 'bg-fjord text-white disabled:opacity-40'
      : 'bg-surface text-ink border border-line disabled:opacity-40'
  return (
    <button {...rest} className={`inline-flex items-center justify-center gap-3 rounded-2xl px-6 py-3.5 text-lg font-bold ${look} ${className}`}>
      {children}
      {hint && <kbd className="hidden rounded-md border border-white/50 px-2 text-sm font-normal sm:inline">{hint}</kbd>}
    </button>
  )
}

export function AudioButton({ text, size = 56, label = 'Play audio' }: { text: string; size?: number; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => void speak(text)}
      className="flex shrink-0 items-center justify-center rounded-full bg-fjord text-white"
      style={{ width: size, height: size }}
    >
      <Volume2 size={size * 0.42} />
    </button>
  )
}

export function Note({ icon, title, tone = 'sun', children }: { icon?: ReactNode; title: string; tone?: Tone; children: ReactNode }) {
  return (
    <div className={`rise flex gap-3.5 rounded-2xl px-5 py-4 ${SOFT[tone]}`}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>
        <div className={`font-bold ${TEXT[tone]}`}>{title}</div>
        <div className="text-lg text-ink">{children}</div>
      </div>
    </div>
  )
}

export function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div>
      <h1 className="m-0 text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
      {sub && <p className="m-0 mt-1.5 text-lg text-muted">{sub}</p>}
    </div>
  )
}
