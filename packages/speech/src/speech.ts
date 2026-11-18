// Recorded voices are used when they exist (see build-audio.ts in @norsk/content);
// otherwise the browser's built-in voices (Web Speech API) speak the text.
import {
  audioKey,
  audioPath,
  recordedVoices,
  spokenText,
} from "@norsk/content";

import { browserHost } from "./host";
import type { SpeakOptions, Speech, SpeechDeps, Voice } from "./types";

const DAY = 86_400_000;

/** How the speaking-speed setting (made for built-in voices, where 0.9 is normal) maps to recordings. */
const NORMAL_RATE = 0.9;

/** How long a recording may take to arrive before the browser's voice speaks instead. */
const LOAD_TIMEOUT_MS = 4000;

const NORWEGIAN = /^(?:nb|no)(?:[-_]|$)/iu;

export const createSpeech = (deps: SpeechDeps): Speech => {
  const host = deps.host ?? browserHost();

  /** Counts the texts asked for, so a recording that arrives late knows it has been overtaken. */
  let playing = 0;

  /** Recordings already fetched, by path. */
  const loaded = new Map<string, string>();

  const voices = (): Voice[] =>
    (host.synthesis()?.voices() ?? [])
      .filter((voice) => NORWEGIAN.test(voice.lang))
      .toSorted(
        (a, b) =>
          Number(b.localService) - Number(a.localService) ||
          a.name.localeCompare(b.name)
      );

  /** The address of a recording for the player, or null if the server has none. */
  const load = async (path: string): Promise<string | null> => {
    const known = loaded.get(path);

    if (known !== undefined) {
      return known;
    }

    const response = await host.fetch(path, {
      signal: AbortSignal.timeout(LOAD_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const url = host.objectUrl(await response.blob());

    loaded.set(path, url);

    return url;
  };

  /**
   * Plays the recording of a text. Returns false if there is none, so the caller can fall back.
   * A text keeps one voice for a day and changes voice over time: hearing several speakers trains the ear.
   */
  const playRecorded = async (
    text: string,
    options: SpeakOptions
  ): Promise<boolean> => {
    const player = host.player();

    if (recordedVoices.length === 0 || player === null) {
      return false;
    }

    playing += 1;

    const turn = playing;

    try {
      const key = await audioKey(text);

      const index =
        options.voiceIndex ??
        Number.parseInt(key.slice(0, 6), 16) + Math.floor(host.now() / DAY);

      const voice = recordedVoices[index % recordedVoices.length];

      const url =
        voice === undefined ? null : await load(audioPath(voice, key));

      if (url === null) {
        return false;
      }

      // Another text was requested while this one loaded.
      if (turn !== playing) {
        return true;
      }

      host.synthesis()?.cancel();
      await player.play(
        url,
        (options.rate ?? deps.settings().rate) / NORMAL_RATE
      );

      return true;
    } catch {
      return false;
    }
  };

  const speakBuiltIn = async (
    text: string,
    options: SpeakOptions
  ): Promise<void> => {
    const synthesis = host.synthesis();

    if (synthesis === null) {
      return;
    }

    const all = voices();
    const { rate, voice: chosen } = deps.settings();

    const voice =
      options.voiceIndex !== undefined && all.length > 0
        ? all[options.voiceIndex % all.length]
        : (all.find((candidate) => candidate.voiceURI === chosen) ?? all[0]);

    synthesis.cancel();
    await synthesis.say({
      lang: voice?.lang ?? "nb-NO",
      rate: options.rate ?? rate,
      text: spokenText(text),
      voice: voice ?? null,
    });
  };

  return {
    onVoicesChange: (listener) => {
      const stop = host.synthesis()?.onVoicesChange(listener);

      return () => {
        stop?.();
      };
    },

    speak: async (text, options = {}) => {
      if (await playRecorded(text, options)) {
        return;
      }

      await speakBuiltIn(text, options);
    },

    stopSpeaking: () => {
      playing += 1;
      host.player()?.pause();
      host.synthesis()?.cancel();
    },

    voices,
  };
};
