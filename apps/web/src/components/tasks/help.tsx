// The help a learner can ask for while recalling: a hint, or the answer when nothing comes to mind.
import type { Item } from "@norsk/content";
import { Button, Card, Display, effects } from "@norsk/ui";
import * as stylex from "@stylexjs/stylex";

import { hasArticle } from "./items";
import { taskStyles } from "./task-styles";

interface HelpButtonsProps {
  /** Null when there is no hint left to ask for. */
  onHint: (() => void) | null;
  onReveal: () => void;
}

/** "Hint" and "I don't know", under the question. Either one means the item was not remembered. */
export const HelpButtons = ({ onHint, onReveal }: HelpButtonsProps) => (
  <div {...stylex.props(effects.rise, taskStyles.help)}>
    {onHint === null ? null : (
      <Button variant="outline" size="medium" onClick={onHint}>
        Hint
      </Button>
    )}
    <Button variant="outline" size="medium" onClick={onReveal}>
      I don’t know
    </Button>
  </div>
);

interface CopyOnceProps {
  item: Item;
}

/** The answer, shown for the learner to type once. */
export const CopyOnce = ({ item }: CopyOnceProps) => (
  <Card style={[effects.rise, taskStyles.copy]}>
    <div {...stylex.props(taskStyles.copyLabel)}>Copy it once</div>
    <div {...stylex.props(taskStyles.copyWord)}>
      <Display text={item.answers[0] ?? ""} split={hasArticle(item)} />
    </div>
  </Card>
);
