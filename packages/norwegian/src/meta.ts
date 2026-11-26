// What is particular to Norwegian outside the curriculum. The app reads this and nothing else
// about the language; see CourseMeta in @norsk/course for what each line is for.
import type { CourseMeta } from "@norsk/course";

export const meta: CourseMeta = {
  articles: ["en", "ei", "et"],
  base: "English",
  greetings: {
    day: "God dag",
    done: "Ferdig!",
    evening: "God kveld",
    morning: "God morgen",
    welcome: "Velkommen",
  },
  flag: "🇳🇴",
  id: "no",
  infinitive: "å",
  lang: "nb-NO",
  // The keys sit where the letters are on a Norwegian keyboard, and no answer uses the characters themselves.
  letters: [
    { key: "'", letter: "æ" },
    { key: ";", letter: "ø" },
    { key: "[", letter: "å" },
  ],
  name: "Norwegian",
  sample: "Hei! Hvordan går det?",
  tones: {
    1: "Melody 1: low, then rising",
    2: "Melody 2: dips, then rises",
  },
  tutor: {
    everyday:
      '"en word", "ei word", "et word" (never neuter, masculine, feminine or common gender)',
    language: "Norwegian (Bokmål)",
    learner: "an English speaker",
    rules: [
      "In Bokmål an ei word may also be used as an en word (“boka” or “boken”, “ei bok” or “en bok”). Both are correct.",
      "A verb has one form for everyone (“jeg er”, “vi er”). Never say that a verb must match or agree with who does it.",
    ],
    standard: "Bokmål",
    word: "hus",
  },
  voiceLangs: ["nb", "no"],
  wordmark: "norsk",
};
