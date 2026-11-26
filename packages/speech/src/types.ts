// The public types of the speech module.
import type { CourseMeta } from "@norsk/course";

/** A voice built into the browser that speaks the language of the course. */
export interface Voice {
  readonly name: string;
  /** The language the voice speaks, for example "nb-NO". */
  readonly lang: string;
  /** What the voice setting stores. */
  readonly voiceURI: string;
  /** True if the voice is on the device and needs no connection. */
  readonly localService: boolean;
}

export interface SpeakOptions {
  /** Speed for this text only. Without it the learner's setting is used. */
  rate?: number;
  /** Picks among the voices in turn; used by the sound drill to vary the speaker. */
  voiceIndex?: number;
}

/** What this module needs of a course. A `Course` fits. */
export interface SpokenCourse {
  meta: Pick<CourseMeta, "lang" | "voiceLangs">;
  /** Voices that have recordings, by their short name. */
  voices: readonly string[];
}

/** The learner's choices, which are kept outside this module. */
export interface SpeechSettings {
  /** `voiceURI` of the browser voice to use when there is no recording, or null for the first one. */
  voice: string | null;
  /** Speed of speech, where 0.9 is the normal speed. */
  rate: number;
}

/** What one text sounds like when the browser's own voice says it. */
export interface Utterance {
  text: string;
  lang: string;
  voice: Voice | null;
  rate: number;
}

/** The browser's speech synthesis. */
export interface Synthesis {
  /** Every voice of the browser, in any language. */
  voices: () => Voice[];
  /** Says the text. Resolves when it ends or fails. */
  say: (utterance: Utterance) => Promise<void>;
  /** Stops what is being said. */
  cancel: () => void;
  /** Calls `listener` when the list of voices changes. Returns a function that stops it. */
  onVoicesChange: (listener: () => void) => () => void;
}

/** The one audio player for recordings. */
export interface Player {
  /**
   * Plays a file at a speed, in place of what plays now. Resolves when it ends, fails or is paused.
   * A file that another one replaces is not paused, so its call stays open.
   */
  play: (url: string, rate: number) => Promise<void>;
  pause: () => void;
}

/** The parts of the browser that make sound. Tests pass their own. */
export interface SpeechHost {
  /** Null in a browser that cannot speak. */
  synthesis: () => Synthesis | null;
  /** Null in a browser that cannot play audio files. */
  player: () => Player | null;
  fetch: (path: string, init: RequestInit) => Promise<Response>;
  /** An address the player can play the file from. */
  objectUrl: (file: Blob) => string;
  /** The current time in milliseconds. */
  now: () => number;
}

export interface SpeechDeps {
  /** The course that is spoken: its language, and the voices that have recordings. */
  course: SpokenCourse;
  /** Read each time a text is spoken, so a change of the settings is heard at once. */
  settings: () => SpeechSettings;
  /** Defaults to the browser. */
  host?: SpeechHost;
}

export interface Speech {
  /** Speaks text in the language of the course. Resolves when the audio ends, or at once if there is no voice. */
  speak: (text: string, options?: SpeakOptions) => Promise<void>;
  stopSpeaking: () => void;
  /** The voices of the browser that speak the language of the course: those on the device first, then by name. */
  voices: () => Voice[];
  /** Calls `listener` when the list of voices may have changed. Returns a function that stops it. */
  onVoicesChange: (listener: () => void) => () => void;
}
