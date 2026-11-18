// Draws whichever task a session has picked.
import type { Task, TaskResult } from "@norsk/engine";

import { CardTask } from "./card-task";
import type { Frame } from "./frame";
import { IntroTask } from "./intro-task";
import { PatternTask } from "./pattern-task";
import { SentenceTask } from "./sentence-task";
import { SoundTask } from "./sound-task";
import { StoryTask } from "./story-task";

interface TaskScreenProps {
  /** Any task but the end of the session. */
  task: Exclude<Task, { type: "done" }>;
  frame: Frame;
  onDone: (result: TaskResult) => void | Promise<void>;
}

export const TaskScreen = ({ task, frame, onDone }: TaskScreenProps) => {
  switch (task.type) {
    case "sound": {
      return (
        <SoundTask
          pair={task.pair}
          target={task.target}
          index={task.index}
          frame={{ ...frame, label: `${task.index + 1} of ${task.total}` }}
          onDone={onDone}
        />
      );
    }

    case "intro": {
      return <IntroTask items={task.items} frame={frame} onDone={onDone} />;
    }

    case "pattern": {
      return (
        <PatternTask
          item={task.item}
          practice={task.practice}
          frame={frame}
          onDone={onDone}
        />
      );
    }

    case "card": {
      return <CardTask item={task.item} frame={frame} onDone={onDone} />;
    }

    case "sentence": {
      return (
        <SentenceTask sentence={task.sentence} frame={frame} onDone={onDone} />
      );
    }

    case "story": {
      return <StoryTask story={task.story} frame={frame} onDone={onDone} />;
    }

    default: {
      throw new Error(`Unknown task: ${JSON.stringify(task satisfies never)}`);
    }
  }
};
