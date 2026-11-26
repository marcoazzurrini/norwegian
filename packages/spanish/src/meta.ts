// What is particular to Spanish outside the curriculum. The app reads this and nothing else
// about the language; see CourseMeta in @norsk/course for what each line is for.
import type { CourseMeta } from "@norsk/course";

export const meta: CourseMeta = {
  articles: ["el", "la"],
  base: "Italian",
  greetings: {
    day: "Buenas tardes",
    done: "¡Hecho!",
    evening: "Buenas noches",
    morning: "Buenos días",
    welcome: "Bienvenido",
  },
  flag: "🇪🇸",
  id: "es",
  infinitive: null,
  lang: "es-ES",
  // The keys are ones no answer uses. "ñ" sits where it is on a Spanish keyboard; the vowels go from left to right on the keys beside it.
  letters: [
    { key: "[", letter: "á" },
    { key: "]", letter: "é" },
    { key: "\\", letter: "í" },
    { key: "'", letter: "ó" },
    { key: "=", letter: "ú" },
    { key: ";", letter: "ñ" },
  ],
  name: "Spanish",
  sample: "¡Hola! ¿Qué tal?",
  tones: {},
  tutor: {
    everyday: '"el word", "la word" (never masculine or feminine gender)',
    language: "Spanish (as spoken in Spain)",
    learner: "an Italian speaker",
    rules: [
      "The learner knows Italian grammar. Where Spanish works like Italian, say so in a few words; where it differs, name the difference.",
      "The course teaches the Spanish of Spain: “vosotros” for several people, and “z” and “c” before “e” or “i” as in “gracias”.",
      "The course is at beginner level and only uses the present tense. Never explain with a past or future form.",
    ],
    standard: "Spanish of Spain",
    word: "casa",
  },
  voiceLangs: ["es"],
  wordmark: "español",
};
