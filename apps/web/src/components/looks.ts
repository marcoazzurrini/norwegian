import type { ItemState, LessonState } from "@norsk/engine";
// How the state of a lesson or an item is named and coloured, wherever it is shown.
import type { TagTone } from "@norsk/ui";

interface Look {
  label: string;
  tone: TagTone;
}

export const ITEM_LOOK: Record<ItemState, Look> = {
  learning: { label: "Learning", tone: "progress" },
  locked: { label: "Locked", tone: "neutral" },
  ready: { label: "Ready", tone: "new" },
  stable: { label: "Stable", tone: "good" },
};

export const LESSON_LOOK: Record<LessonState, Look> = {
  done: { label: "Learned", tone: "good" },
  locked: { label: "Locked", tone: "neutral" },
  ready: { label: "Ready to learn", tone: "new" },
  started: { label: "In progress", tone: "progress" },
};
