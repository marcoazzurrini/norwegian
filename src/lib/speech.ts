// Norwegian audio through the browser's built-in voices (Web Speech API).
import { useEffect, useState } from 'react'
import { getState } from '../engine/store'

const supported = () => typeof window !== 'undefined' && 'speechSynthesis' in window

export function norwegianVoices(): SpeechSynthesisVoice[] {
  if (!supported()) return []
  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^(nb|no)([-_]|$)/i.test(v.lang))
    .sort((a, b) => Number(b.localService) - Number(a.localService) || a.name.localeCompare(b.name))
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!supported()) return
    const update = () => setVoices(norwegianVoices())
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

export interface SpeakOptions {
  rate?: number
  /** Picks among the Norwegian voices in turn; used by the sound drill to vary the speaker. */
  voiceIndex?: number
}

/** Speaks Norwegian text. Resolves when the audio ends, or at once if there is no voice. */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!supported()) return Promise.resolve()
  const voices = norwegianVoices()
  const { voice: chosen, rate } = getState().meta.settings
  const voice =
    options.voiceIndex !== undefined && voices.length
      ? voices[options.voiceIndex % voices.length]
      : (voices.find((v) => v.voiceURI === chosen) ?? voices[0])
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim())
    u.lang = voice?.lang ?? 'nb-NO'
    if (voice) u.voice = voice
    u.rate = options.rate ?? rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  })
}

export const stopSpeaking = () => supported() && window.speechSynthesis.cancel()
