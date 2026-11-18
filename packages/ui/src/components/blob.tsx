// The coloured shape that identifies an activity.
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import {
  BookOpen,
  Ear,
  Repeat,
  RotateCcw,
  Sparkles,
  Waypoints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { color, radius } from "../tokens/tokens.stylex";

export type BlobKind = "sounds" | "review" | "new" | "story" | "recall" | "map";

const styles = stylex.create({
  blob: {
    alignItems: "center",
    color: color.onInverse,
    display: "flex",
    flexShrink: 0,
    height: "2.75rem",
    justifyContent: "center",
    width: "2.75rem",
  },
  // The icon follows the size of the shape.
  icon: {
    height: "46%",
    width: "46%",
  },
  // A tilted shape turns its icon back, so the icon stays upright.
  left: { rotate: "-8deg" },
  right: { rotate: "8deg" },
});

const kinds = stylex.create({
  sounds: { backgroundColor: color.teal, borderRadius: radius.pill },
  review: { backgroundColor: color.blue, borderRadius: "32%" },
  new: {
    backgroundColor: color.violet,
    borderRadius: "58% 42% 50% 50% / 46% 54% 46% 54%",
  },
  story: { backgroundColor: color.orange, borderRadius: radius.pill },
  recall: { backgroundColor: color.green, borderRadius: "32%" },
  map: {
    backgroundColor: color.indigo,
    borderRadius: "50% 50% 42% 58% / 56% 44% 56% 44%",
  },
});

const ICON: Record<BlobKind, LucideIcon> = {
  map: Waypoints,
  new: Sparkles,
  recall: RotateCcw,
  review: Repeat,
  sounds: Ear,
  story: BookOpen,
};

interface BlobProps {
  kind: BlobKind;
  /** Sets the size: give `width` and `height`. The default is 2.75rem. */
  style?: StyleXStyles;
}

export const Blob = ({ kind, style }: BlobProps) => {
  const Icon = ICON[kind];

  return (
    <span
      aria-hidden
      {...stylex.props(
        styles.blob,
        kinds[kind],
        kind === "review" && styles.left,
        kind === "recall" && styles.right,
        style
      )}
    >
      <Icon
        {...stylex.props(
          styles.icon,
          kind === "review" && styles.right,
          kind === "recall" && styles.left
        )}
      />
    </span>
  );
};
