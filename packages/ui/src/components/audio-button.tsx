// The white round button that plays audio in the language of the course. The caller plays the sound.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { effects } from "../tokens/effects";
import { color, radius } from "../tokens/tokens.stylex";

const styles = stylex.create({
  button: {
    alignItems: "center",
    backgroundColor: color.inverse,
    borderRadius: radius.pill,
    borderWidth: 0,
    color: color.onInverse,
    display: "flex",
    flexShrink: 0,
    height: "2.5rem",
    justifyContent: "center",
    width: "2.5rem",
  },
  // The icon follows the size of the button.
  icon: {
    height: "45%",
    width: "45%",
  },
});

interface AudioButtonProps {
  onPlay: () => void;
  label?: string;
  icon?: LucideIcon;
  /** Sets the size: give `width` and `height`. The default is 2.5rem. */
  style?: StyleXStyles;
  /** Sets the size of the icon inside, as a share of the button. The default is 45%. */
  iconStyle?: StyleXStyles;
}

export const AudioButton = ({
  onPlay,
  label = "Play audio",
  icon: Icon = Volume2,
  style,
  iconStyle,
}: AudioButtonProps) => (
  <button
    type="button"
    aria-label={label}
    onClick={onPlay}
    {...stylex.props(effects.press, styles.button, style)}
  >
    <Icon strokeWidth={2} {...stylex.props(styles.icon, iconStyle)} />
  </button>
);
