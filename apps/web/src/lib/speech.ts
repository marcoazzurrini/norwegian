import { recordedVoices, audioKey, audioPath } from "@norsk/content";
// Norwegian audio. Recorded voices are used when they exist (see scripts/build-audio.ts);
// otherwise the browser's built-in voices (Web Speech API) speak the text.
import { useEffect, useState } from "react";

import { getState } from "../engine/store";

const supported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window;

export function norwegianVoices(): SpeechSynthesisVoice[] {
  if (!supported()) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter((v) => /^(nb|no)([-_]|$)/i.test(v.lang))
    .sort(
      (a, b) =>
        Number(b.localService) - Number(a.localService) ||
        a.name.localeCompare(b.name)
    );
}

export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!supported()) {
      return;
    }

    const update = () => {
      setVoices(norwegianVoices());
    };

    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", update);
    };
  }, []);

  return voices;
}

export interface SpeakOptions {
  rate?: number;
  /** Picks among the Norwegian voices in turn; used by the sound drill to vary the speaker. */
  voiceIndex?: number;
}

const DAY = 86_400_000;

/** How the speaking-speed setting (made for built-in voices, where 0.9 is normal) maps to recordings. */
const NORMAL_RATE = 0.9;
let player: HTMLAudioElement | null = null;
let playing = 0;
const blobs = new Map<string, string>();

/**
 * Plays the recording of a text. Returns false if there is none, so the caller can fall back.
 * A text keeps one voice for a day and changes voice over time: hearing several speakers trains the ear.
 */
async function playRecorded(
  text: string,
  options: SpeakOptions
): Promise<boolean> {
  const voices = recordedVoices;

  if (!voices.length || typeof Audio === "undefined") {
    return false;
  }

  const turn = ++playing;

  try {
    const key = await audioKey(text);

    const index =
      options.voiceIndex ??
      Number.parseInt(key.slice(0, 6), 16) + Math.floor(Date.now() / DAY);

    const path = audioPath(voices[index % voices.length], key);
    let url = blobs.get(path);

    if (!url) {
      const response = await fetch(path, { signal: AbortSignal.timeout(4000) });

      if (!response.ok) {
        return false;
      }

      url = URL.createObjectURL(await response.blob());
      blobs.set(path, url);
    }

    // Another text was requested while this one loaded.
    if (turn !== playing) {
      return true;
    }

    window.speechSynthesis?.cancel();
    player ??= new Audio();
    const audio = player;
    audio.pause();
    audio.src = url;
    audio.playbackRate =
      (options.rate ?? getState().meta.settings.rate) / NORMAL_RATE;
    await new Promise<void>((resolve) => {
      audio.onended =
        audio.onerror =
        audio.onpause =
          () => {
            resolve();
          };

      // Browsers refuse sound before the first tap; that is not an error worth reporting.
      audio.play().catch(() => {
        resolve();
      });
    });

    return true;
  } catch {
    return false;
  }
}

/** Speaks Norwegian text. Resolves when the audio ends, or at once if there is no voice. */
export async function speak(
  text: string,
  options: SpeakOptions = {}
): Promise<void> {
  if (await playRecorded(text, options)) {
    return;
  }

  await speakBuiltIn(text, options);
}

async function speakBuiltIn(
  text: string,
  options: SpeakOptions
): Promise<void> {
  if (!supported()) {
    return;
  }

  const voices = norwegianVoices();
  const { voice: chosen, rate } = getState().meta.settings;

  const voice =
    options.voiceIndex !== undefined && voices.length
      ? voices[options.voiceIndex % voices.length]
      : (voices.find((v) => v.voiceURI === chosen) ?? voices[0]);

  return await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(
      text.replaceAll(/_+/g, " ").replaceAll(/\s+/g, " ").trim()
    );

    u.lang = voice?.lang ?? "nb-NO";

    if (voice) {
      u.voice = voice;
    }

    u.rate = options.rate ?? rate;
    u.onend = () => {
      resolve();
    };

    u.onerror = () => {
      resolve();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

export const stopSpeaking = () => {
  playing++;
  player?.pause();

  if (supported()) {
    window.speechSynthesis.cancel();
  }
};
