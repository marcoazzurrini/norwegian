// A short text built from known words: read and listen, tap a word for its meaning, then answer questions.
// Nothing is graded; finishing the questions marks the story as read.
import type { Course, Item, Story, Token } from "@norsk/course";

import { askQuestion, pickOption } from "./quiz";
import type { QuizState } from "./quiz";
import { EMPTY_RESULT, stay } from "./types";
import type { Step, TaskMachine } from "./types";

export interface StoryInput {
  /** The course the story belongs to. */
  course: Course;
  story: Story;
}

/** What a tapped word means: its taught item, or the story's own gloss for a word that is not an item. */
export interface WordMeaning {
  text: string;
  gloss: string;
  item: Item | null;
}

export interface PickedWord {
  line: number;
  /** Position of the word among the tokens of its line. */
  index: number;
  /** Null for a word without an item or a gloss, such as a name. */
  meaning: WordMeaning | null;
}

export type StoryPhase =
  | { step: "read" }
  | { step: "questions"; quiz: QuizState };

export interface StoryState {
  course: Course;
  story: Story;
  phase: StoryPhase;
  /** The word the learner tapped last. */
  picked: PickedWord | null;
  showBase: boolean;
  done: boolean;
}

export type StoryEvent =
  | { type: "toggleBase" }
  | { type: "tapWord"; line: number; index: number }
  /** A line or a speaker's name was tapped: play that line. */
  | { type: "hearLine"; line: number }
  /** Done reading: go to the questions. */
  | { type: "continue" }
  | { type: "pick"; option: string }
  /** The pause after a right pick is over. */
  | { type: "next" };

const meaningOf = (
  { course, story }: StoryState,
  token: Token
): WordMeaning | null => {
  const id = token.w ?? token.c;

  if (id !== undefined) {
    const it = course.item(id);

    return { gloss: it.gloss, item: it, text: it.display };
  }

  const gloss = story.glosses[token.t.toLowerCase()];

  return gloss === undefined || gloss === ""
    ? null
    : { gloss, item: null, text: token.t };
};

const init = ({ course, story }: StoryInput): Step<StoryState> =>
  stay({
    course,
    done: false,
    phase: { step: "read" },
    picked: null,
    showBase: false,
    story,
  });

/** Shows the question at `index`. After the last one the story is done. */
const ask = (state: StoryState, index: number): Step<StoryState> => {
  const quiz = askQuestion(state.story.questions, index);

  if (quiz !== null) {
    return stay({ ...state, phase: { quiz, step: "questions" } });
  }

  return {
    effects: [
      { id: state.story.id, type: "storyDone" },
      { result: EMPTY_RESULT, type: "done" },
    ],
    state: { ...state, done: true },
  };
};

const tapWord = (
  state: StoryState,
  line: number,
  index: number
): Step<StoryState> => {
  const token = state.story.lines[line]?.tokens[index];

  return token === undefined
    ? stay(state)
    : stay({
        ...state,
        picked: { index, line, meaning: meaningOf(state, token) },
      });
};

const hearLine = (state: StoryState, line: number): Step<StoryState> => {
  const text = state.story.lines[line]?.target;

  return text === undefined
    ? stay(state)
    : { effects: [{ text, type: "speak" }], state };
};

const reading = (state: StoryState, event: StoryEvent): Step<StoryState> => {
  switch (event.type) {
    case "toggleBase": {
      return stay({ ...state, showBase: !state.showBase });
    }

    case "tapWord": {
      return tapWord(state, event.line, event.index);
    }

    case "hearLine": {
      return hearLine(state, event.line);
    }

    case "continue": {
      return ask(state, 0);
    }

    // Answers belong to the questions, which have not started.
    case "pick":
    case "next": {
      return stay(state);
    }

    default: {
      return stay(state);
    }
  }
};

const step = (state: StoryState, event: StoryEvent): Step<StoryState> => {
  const { phase } = state;

  if (state.done) {
    return stay(state);
  }

  if (phase.step === "read") {
    return reading(state, event);
  }

  if (event.type === "pick") {
    return stay({
      ...state,
      phase: { ...phase, quiz: pickOption(phase.quiz, event.option) },
    });
  }

  return event.type === "next" && phase.quiz.answered
    ? ask(state, phase.quiz.index + 1)
    : stay(state);
};

export const storyTask: TaskMachine<StoryInput, StoryState, StoryEvent> = {
  init,
  step,
};
