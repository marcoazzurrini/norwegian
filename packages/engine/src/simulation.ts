// A simulated learner for the tests. Not part of the public interface.
//
// It studies with the real session and the real task machines, and answers right with a fixed
// probability. It brings its own clock and its own random numbers, so a run can be repeated exactly.
import { item, lessonOf } from "@norsk/content";
import type { Item, Sentence } from "@norsk/content";

import {
  Session,
  applyReview,
  cardTask,
  createScheduler,
  dueItems,
  introTask,
  introduce,
  lessonState,
  patternTask,
  pickReview,
  retrievability,
  sentenceTask,
  soundTask,
  storyTask,
} from "./index";
import type {
  CardEvent,
  CardState,
  Effect,
  IntroEvent,
  IntroState,
  Mem,
  PatternEvent,
  PatternState,
  QuizState,
  Scheduler,
  SentenceEvent,
  SentenceState,
  SessionStats,
  SessionView,
  SoundEvent,
  SoundState,
  SoundStats,
  StoryEvent,
  StoryState,
  Task,
  TaskMachine,
  TaskResult,
} from "./index";
import { DAY, T0, lessonAt, must } from "./testing";

export interface Options {
  seed: number;
  days: number;
  /** Length of the daily session. */
  minutes: number;
  /** Chance of a right answer on the first try. */
  accuracy: number;
  /** Days on which the learner does not study. */
  daysOff?: number[];
}

/** What happened in one task, and what the learner's state was when the session chose it. */
export interface TaskRecord {
  day: number;
  type: Exclude<Task["type"], "done">;
  /** The item, sentence, story or sound pair the task was about. */
  subject: string;
  /** Session time used before the task started. */
  elapsedBefore: number;
  /** Session time spent on reviews before the task started. */
  reviewMsBefore: number;
  /** Reviews that were due when the task was chosen. */
  dueReviews: number;
  /** A review could have been served instead of this task. */
  reviewable: boolean;
  /** For new material: every lesson it needs was finished. */
  prerequisitesDone: boolean;
  /** Time the session counted for the task. */
  ms: number;
  taught: string[];
  result: TaskResult;
}

export interface DayRecord {
  day: number;
  budgetMs: number;
  elapsedMs: number;
  tasks: number;
  stats: SessionStats;
  /** Items in memory when the day's session ended. */
  learned: number;
  /** Mean chance of recall over all items when the session started; null while nothing is learned. */
  recallAtStart: number | null;
}

export interface Run {
  days: DayRecord[];
  tasks: TaskRecord[];
  memory: Mem[];
  storiesDone: string[];
  /** Reviews that named an item the learner does not have. Always zero if the engine is right. */
  unknownReviews: number;
}

/** Share of the session that reviews may take while new material is waiting, as the session defines it. */
export const REVIEW_SHARE = 0.6;

/** The session keeps the last three items apart from the next task. */
const RECENT_ITEMS = 3;

const SECOND_TRY_ACCURACY = 0.6;
const GIVE_UP_CHANCE = 0.2;
const SOUND_ACCURACY = 0.8;

// How long the learner takes for each kind of step, in milliseconds.
const THINK_MS = 4000;
const TYPE_WORD_MS = 1500;
const CONTINUE_MS = 1500;
const LOOK_MS = 5000;
const PICK_MS = 3000;
const PAUSE_MS = 450;
const READ_RULE_MS = 30_000;
const READ_STORY_MS = 90_000;

/** Stops a task or a session that never ends, instead of hanging the test. */
const MAX_STEPS = 2000;

interface Move<Event> {
  event: Event;
  /** Time the learner takes before the event. */
  ms: number;
}

interface Outcome {
  result: TaskResult | null;
  taught: string[];
}

/** A small repeatable random generator (a linear congruential one). Returns numbers from 0 up to 1. */
export const seededRandom = (seed: number): (() => number) => {
  const modulus = 2 ** 32;
  let state = seed % modulus;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % modulus;

    return state / modulus;
  };
};

const typingTime = (words: number): number =>
  THINK_MS + TYPE_WORD_MS * Math.max(1, words);

const subjectOf = (task: Exclude<Task, { type: "done" }>): string => {
  switch (task.type) {
    case "sound": {
      return task.pair.id;
    }

    case "intro": {
      return task.items.map((it) => it.id).join(" ");
    }

    case "pattern":
    case "card": {
      return task.item.id;
    }

    case "sentence": {
      return task.sentence.id;
    }

    case "story": {
      return task.story.id;
    }

    default: {
      return "";
    }
  }
};

class Learner {
  readonly memory = new Map<string, Mem>();
  readonly storiesDone = new Set<string>();
  readonly tasks: TaskRecord[] = [];
  readonly days: DayRecord[] = [];
  unknownReviews = 0;
  private readonly soundStats: Record<string, SoundStats> = {};
  private readonly scheduler: Scheduler;
  private readonly options: Options;
  private readonly rng: () => number;
  private now = T0;

  constructor(scheduler: Scheduler, options: Options) {
    this.scheduler = scheduler;
    this.options = options;
    this.rng = seededRandom(options.seed);
  }

  /** One session, at the same hour every day. */
  study(day: number): void {
    const session = new Session(this.options.minutes, this.rng);
    const usedSentences = new Set<string>();
    let recent: string[] = [];
    let reviewMs = 0;
    let count = 0;

    this.now = T0 + day * DAY;
    const recallAtStart = this.averageRecall();

    while (count < MAX_STEPS) {
      const task = session.next(this.view(), this.now);

      if (task.type === "done") {
        break;
      }

      const elapsedBefore = session.elapsedMs;
      const known = new Set(this.memory.keys());
      const isNew = task.type === "intro" || task.type === "pattern";

      const record = {
        day,
        dueReviews: dueItems(this.memory, this.now).review.length,
        elapsedBefore,
        prerequisitesDone: !isNew || this.prerequisitesDone(task),
        reviewMsBefore: reviewMs,
        reviewable:
          pickReview(this.memory, this.now, usedSentences, new Set(recent)) !==
          null,
        subject: subjectOf(task),
        type: task.type,
      };

      const started = this.now;
      const outcome = this.perform(task, known);
      const result = must(outcome.result);
      const ms = session.complete(task, result, this.now - started);

      if (task.type === "sentence") {
        usedSentences.add(task.sentence.id);
      }

      if (task.type === "card" || task.type === "sentence") {
        reviewMs += ms;
      }

      recent = [...result.itemIds.toReversed(), ...recent].slice(
        0,
        RECENT_ITEMS
      );
      this.tasks.push({ ...record, ms, result, taught: outcome.taught });
      count += 1;
    }

    this.days.push({
      budgetMs: session.budgetMs,
      day,
      elapsedMs: session.elapsedMs,
      learned: this.memory.size,
      recallAtStart,
      stats: { ...session.stats },
      tasks: count,
    });
  }

  private view(): SessionView {
    return {
      chosenLesson: null,
      memory: this.memory,
      soundStats: this.soundStats,
      storiesDone: this.storiesDone,
    };
  }

  private averageRecall(): number | null {
    if (this.memory.size === 0) {
      return null;
    }

    let sum = 0;

    for (const m of this.memory.values()) {
      sum += retrievability(this.scheduler, m, this.now);
    }

    return sum / this.memory.size;
  }

  private prerequisitesDone(task: Task): boolean {
    const fresh = task.type === "intro" ? task.items : [];
    const items = task.type === "pattern" ? [task.item] : fresh;

    return items.every((it) =>
      lessonOf(it.id).needs.every(
        (index) => lessonState(lessonAt(index), this.memory) === "done"
      )
    );
  }

  private chance(probability: number): boolean {
    return this.rng() < probability;
  }

  /** Carries out the effects of a task on the learner's data, as the app does on the store. */
  private apply(effects: Effect[], outcome: Outcome): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "teach": {
          for (const id of effect.ids) {
            this.memory.set(id, introduce(this.scheduler, id, this.now));
            outcome.taught.push(id);
          }

          break;
        }

        case "review": {
          for (const input of effect.inputs) {
            const m = this.memory.get(input.id);

            if (m === undefined) {
              this.unknownReviews += 1;
            } else {
              const next = applyReview(this.scheduler, m, input, this.now);
              this.memory.set(input.id, next ?? m);
            }
          }

          break;
        }

        case "soundAnswered": {
          const s = this.soundStats[effect.group] ?? { right: 0, total: 0 };

          this.soundStats[effect.group] = {
            right: s.right + (effect.right ? 1 : 0),
            total: s.total + 1,
          };

          break;
        }

        case "storyDone": {
          this.storiesDone.add(effect.id);

          break;
        }

        case "done": {
          outcome.result = effect.result;

          break;
        }

        // Audio and the time a sentence was last seen do not change what the learner knows.
        case "speak":
        case "sentenceSeen": {
          break;
        }

        default: {
          break;
        }
      }
    }
  }

  /** Runs one task to its end: the learner makes a move, the clock advances, the effects are applied. */
  private drive<Input, State extends { done: boolean }, Event>(
    machine: TaskMachine<Input, State, Event>,
    input: Input,
    choose: (state: State) => Move<Event>
  ): Outcome {
    const outcome: Outcome = { result: null, taught: [] };
    const first = machine.init(input);
    let { state } = first;
    this.apply(first.effects, outcome);

    for (let steps = 0; !state.done && steps < MAX_STEPS; steps += 1) {
      const move = choose(state);
      this.now += move.ms;
      const next = machine.step(state, move.event, this.now);
      ({ state } = next);
      this.apply(next.effects, outcome);
    }

    return outcome;
  }

  private perform(
    task: Exclude<Task, { type: "done" }>,
    known: ReadonlySet<string>
  ): Outcome {
    switch (task.type) {
      case "sound": {
        return this.drive(
          soundTask,
          { index: task.index, pair: task.pair, target: task.target },
          (state) => this.soundMove(state)
        );
      }

      case "intro": {
        return this.drive(introTask, { items: task.items, known }, (state) =>
          this.introMove(state)
        );
      }

      case "pattern": {
        return this.drive(
          patternTask,
          { item: task.item, known, practice: task.practice },
          (state) => this.patternMove(state)
        );
      }

      case "card": {
        return this.drive(cardTask, { item: task.item }, (state) =>
          this.cardMove(state)
        );
      }

      case "sentence": {
        return this.drive(
          sentenceTask,
          { known, sentence: task.sentence },
          (state) => this.sentenceMove(state)
        );
      }

      case "story": {
        return this.drive(storyTask, { story: task.story }, (state) =>
          this.storyMove(state)
        );
      }

      default: {
        return { result: null, taught: [] };
      }
    }
  }

  private soundMove(state: SoundState): Move<SoundEvent> {
    if (state.picked !== null) {
      return { event: { type: "continue" }, ms: CONTINUE_MS };
    }

    const other = state.target === "a" ? "b" : "a";
    const side = this.chance(SOUND_ACCURACY) ? state.target : other;

    return { event: { side, type: "tap" }, ms: THINK_MS };
  }

  /** A typed answer for one item: its first accepted answer, or something that is not Norwegian. */
  private typeItem(
    it: Item,
    accuracy: number
  ): Move<{ type: "answer"; text: string }> {
    const text = this.chance(accuracy) ? must(it.answers[0]) : "xx";

    return { event: { text, type: "answer" }, ms: typingTime(1) };
  }

  private cardMove(state: CardState): Move<CardEvent> {
    const { phase } = state;

    if (phase.step === "result") {
      return { event: { type: "continue" }, ms: CONTINUE_MS };
    }

    if (phase.step === "retry" && this.chance(GIVE_UP_CHANCE)) {
      return { event: { type: "reveal" }, ms: CONTINUE_MS };
    }

    return this.typeItem(
      state.item,
      phase.step === "ask" ? this.options.accuracy : SECOND_TRY_ACCURACY
    );
  }

  private introMove(state: IntroState): Move<IntroEvent> {
    if (state.phase === "show") {
      return { event: { type: "continue" }, ms: LOOK_MS };
    }

    if (state.recalled) {
      return { event: { type: "continue" }, ms: CONTINUE_MS };
    }

    // With the answer on screen to copy, the learner gets it right.
    return this.typeItem(
      state.item,
      state.help === "copy" ? 1 : this.options.accuracy
    );
  }

  /** The sentence with one word left out, which is never a correct answer for a sentence of two words or more. */
  private slip(sentence: Sentence): string {
    const skip = Math.floor(this.rng() * sentence.tokens.length);
    const words = sentence.tokens.flatMap((t, k) => (k === skip ? [] : [t.t]));

    return words.length === 0 ? "xx" : words.join(" ");
  }

  private sentenceMove(state: SentenceState): Move<SentenceEvent> {
    const { phase, sentence } = state;

    if (phase.step === "result") {
      return { event: { type: "continue" }, ms: CONTINUE_MS };
    }

    if (phase.step === "retry" && this.chance(GIVE_UP_CHANCE)) {
      return { event: { type: "reveal" }, ms: CONTINUE_MS };
    }

    const accuracy =
      phase.step === "ask" ? this.options.accuracy : SECOND_TRY_ACCURACY;

    const text = this.chance(accuracy) ? sentence.no : this.slip(sentence);

    return {
      event: { text, type: "answer" },
      ms: typingTime(sentence.tokens.length),
    };
  }

  private quizMove(
    quiz: QuizState
  ): Move<{ type: "pick"; option: string } | { type: "next" }> {
    if (quiz.answered) {
      return { event: { type: "next" }, ms: PAUSE_MS };
    }

    const [right, ...others] = quiz.question.options;
    const untried = others.find((option) => !quiz.wrong.includes(option));

    const option =
      untried === undefined || this.chance(this.options.accuracy)
        ? must(right)
        : untried;

    return { event: { option, type: "pick" }, ms: PICK_MS };
  }

  private patternMove(state: PatternState): Move<PatternEvent> {
    const { phase } = state;

    if (phase.step === "see") {
      return { event: { type: "continue" }, ms: READ_RULE_MS };
    }

    return phase.step === "read"
      ? this.quizMove(phase.quiz)
      : this.sentenceMove(phase.sentence);
  }

  private storyMove(state: StoryState): Move<StoryEvent> {
    return state.phase.step === "read"
      ? { event: { type: "continue" }, ms: READ_STORY_MS }
      : this.quizMove(state.phase.quiz);
  }
}

/** Lets a learner study one session a day and returns everything that happened. */
export const simulate = async (options: Options): Promise<Run> => {
  const scheduler = await createScheduler(0.9);
  const learner = new Learner(scheduler, options);

  const daysOff = new Set(options.daysOff);

  for (let day = 0; day < options.days; day += 1) {
    if (!daysOff.has(day)) {
      learner.study(day);
    }
  }

  return {
    days: learner.days,
    memory: [...learner.memory.values()],
    storiesDone: [...learner.storiesDone],
    tasks: learner.tasks,
    unknownReviews: learner.unknownReviews,
  };
};

/** True if the id belongs to an item of the curriculum. */
export const isRealItem = (id: string): boolean => {
  try {
    return item(id).id === id;
  } catch {
    return false;
  }
};
