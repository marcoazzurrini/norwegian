// What the app knows about a course before it loads the course itself: its name, and the few
// things that differ from one language to the next outside the curriculum.
//
// The app never asks which language a course teaches. Whatever depends on the language is
// written here, by the course, and the app only reads it.

/** A letter that most keyboards lack, and the key that types it in an answer. */
export interface Letter {
  letter: string;
  /** A key that no answer of the course uses, such as "'" for "æ". */
  key: string;
}

/** What the app says to the learner in the language of the course, outside the tasks. */
export interface Greetings {
  /** Said to a learner who is not signed in yet. */
  welcome: string;
  morning: string;
  day: string;
  evening: string;
  /** Said at the end of a session: "Done!". */
  done: string;
}

/** What the language model is told when it explains a mistake. */
export interface Tutor {
  /** Who the learner is, with its article: "an English speaker". */
  learner: string;
  /** The language as the model should know it, for example "Norwegian (Bokmål)". */
  language: string;
  /** What a correct, natural sentence is a sentence of: "Bokmål". */
  standard: string;
  /** A word of the language, to show the model how to quote one. */
  word: string;
  /** Everyday names for the grammar of this language, as they stand in a list: `"en word", "ei word"`. Null for none. */
  everyday: string | null;
  /** Rules that belong to this language, each one line. */
  rules: readonly string[];
}

export interface CourseMeta {
  /** The short name of the course, as it stands in the address of its pages: "no". */
  id: string;
  /** The language in the learner's own language: "Norwegian". */
  name: string;
  /** The name of the app while this course is open, in the language itself: "norsk". */
  wordmark: string;
  /** The flag shown beside the language in the list of courses, as one emoji. */
  flag: string;
  /** The language the meanings and explanations are written in: "English". */
  base: string;
  /** The language tag of the text the learner types and hears, for example "nb-NO". */
  lang: string;
  /** How the language tag of a voice of this language starts: "nb", "no". */
  voiceLangs: readonly string[];
  greetings: Greetings;
  /** A line to try a voice with. */
  sample: string;
  /** The letters most keyboards lack. Empty for a language without any. */
  letters: readonly Letter[];
  /** The articles a noun is learned with, in the order they are named: "en", "ei", "et". Empty for a language without any. */
  articles: readonly string[];
  /** The small word in front of a verb as it is shown, such as "å". Null for a language without one. */
  infinitive: string | null;
  /** What each melody of a word is called, by its number. Empty for a language without word melodies. */
  tones: Readonly<Record<number, string>>;
  tutor: Tutor;
}
