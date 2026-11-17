import { useEffect, useRef } from 'react'

interface AnswerInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
  placeholder?: string
}

/** Text field for Norwegian answers, with buttons for the three letters missing on most keyboards. */
export function AnswerInput({ value, onChange, onSubmit, disabled, placeholder = 'Type in Norwegian' }: AnswerInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!disabled) ref.current?.focus()
  }, [disabled])

  const insert = (letter: string) => {
    const el = ref.current
    const at = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    onChange(value.slice(0, at) + letter + value.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + 1, at + 1)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={ref}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        lang="nb"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-2xl border-2 border-line bg-surface px-5 py-4 text-2xl outline-none focus:border-fjord disabled:bg-paper"
      />
      {!disabled && (
        <div className="flex gap-2">
          {['æ', 'ø', 'å'].map((l) => (
            <button
              key={l}
              type="button"
              tabIndex={-1}
              onClick={() => insert(l)}
              className="h-11 w-12 rounded-xl border border-line bg-surface text-xl text-ink"
              aria-label={`Insert ${l}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
