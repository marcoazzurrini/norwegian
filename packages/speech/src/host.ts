// The browser's two ways of making sound, kept in one place so tests can replace them.
import type { Player, SpeechHost, Synthesis, Voice } from "./types";

const synthesisOf = (speech: SpeechSynthesis): Synthesis => {
  // The browser wants its own voice object back, not a copy of its fields.
  const real = new WeakMap<Voice, SpeechSynthesisVoice>();

  return {
    cancel: () => {
      speech.cancel();
    },

    onVoicesChange: (listener) => {
      speech.addEventListener("voiceschanged", listener);

      return () => {
        speech.removeEventListener("voiceschanged", listener);
      };
    },

    say: async ({ lang, rate, text, voice }) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const chosen = voice === null ? undefined : real.get(voice);

      utterance.lang = lang;

      if (chosen !== undefined) {
        utterance.voice = chosen;
      }

      utterance.rate = rate;

      // oxlint-disable-next-line promise/avoid-new -- the browser reports the end of speech through events, which only a new promise can wait for
      await new Promise<void>((resolve) => {
        utterance.addEventListener("end", () => {
          resolve();
        });
        utterance.addEventListener("error", () => {
          resolve();
        });
        speech.speak(utterance);
      });
    },

    voices: () => {
      const all = speech.getVoices();

      for (const voice of all) {
        real.set(voice, voice);
      }

      return all;
    },
  };
};

/** What a file can do when it is over. */
const ENDINGS = ["ended", "error", "pause"] as const;

const playerOf = (audio: HTMLAudioElement): Player => {
  // Only the newest file is listened to: one that was replaced must not end the one that replaced it.
  let listening = new AbortController();

  return {
    pause: () => {
      audio.pause();
    },

    play: async (url, rate) => {
      audio.pause();
      audio.src = url;
      audio.playbackRate = rate;
      listening.abort();
      listening = new AbortController();

      const { signal } = listening;

      // oxlint-disable-next-line promise/avoid-new -- the player reports the end of a file through events, which only a new promise can wait for
      await new Promise<void>((resolve) => {
        const over = (): void => {
          resolve();
        };

        for (const ending of ENDINGS) {
          audio.addEventListener(ending, over, { signal });
        }

        // Browsers refuse sound before the first tap; that is not an error worth reporting.
        audio.play().catch(over);
      });
    },
  };
};

/** Everything is looked up when it is first needed: this module also loads where there is no browser. */
export const browserHost = (): SpeechHost => {
  let synthesis: Synthesis | null = null;
  let player: Player | null = null;

  return {
    fetch: async (path, init) => await fetch(path, init),
    now: () => Date.now(),
    objectUrl: (file) => URL.createObjectURL(file),

    player: () => {
      if (typeof Audio === "undefined") {
        return null;
      }

      player ??= playerOf(new Audio());

      return player;
    },

    synthesis: () => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        return null;
      }

      synthesis ??= synthesisOf(window.speechSynthesis);

      return synthesis;
    },
  };
};
