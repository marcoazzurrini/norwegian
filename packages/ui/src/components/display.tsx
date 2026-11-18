// A Norwegian word such as "et hus", with the article quieter than the word.
import * as stylex from "@stylexjs/stylex";

import { color } from "../tokens/tokens.stylex";

const styles = stylex.create({
  article: { color: color.fg3 },
});

interface DisplayProps {
  text: string;
  /** True if the text starts with an article that should be quieter. */
  split: boolean;
}

export const Display = ({ text, split }: DisplayProps) => {
  const at = split ? text.indexOf(" ") : -1;

  if (at === -1) {
    return text;
  }

  return (
    <>
      <span {...stylex.props(styles.article)}>{text.slice(0, at + 1)}</span>
      {text.slice(at + 1)}
    </>
  );
};
