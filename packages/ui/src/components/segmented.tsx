// A row of options of which exactly one is chosen.
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { effects } from "../tokens/effects";
import { color, motion, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  group: {
    backgroundColor: color.control,
    borderRadius: radius.pill,
    display: "inline-flex",
    fontSize: text.s15,
    fontWeight: 500,
    maxWidth: "100%",
    padding: "0.25rem",
    // The pill is placed against the group.
    position: "relative",
  },
  groupLarge: {
    fontSize: { default: text.s15, [stylex.env.desktop]: text.s17 },
  },
  option: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: radius.pill,
    borderWidth: 0,
    color: color.fg2,
    // Base UI renders the option as a span, so it needs what a button has by default.
    cursor: "pointer",
    display: "flex",
    gap: "0.375rem",
    height: "2.125rem",
    paddingInline: "0.875rem",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  optionStretch: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: "center",
  },
  optionOff: {
    color: color.fg3,
    cursor: "default",
  },
  optionLarge: {
    height: { default: "2.125rem", [stylex.env.desktop]: "2.5rem" },
    paddingInline: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
  },
  chosen: {
    backgroundColor: color.inverse,
    color: color.onInverse,
  },
  // A second copy of the options, in the colours of the chosen one, that lies over the group.
  // Only the part over the chosen option is shown. That part slides to a new choice, so the
  // text of every option stays readable while the pill passes over it.
  pill: {
    backgroundColor: color.inverse,
    borderRadius: "inherit",
    color: color.onInverse,
    display: "flex",
    inset: 0,
    // The caller may change the padding of the group; the copy has to match it.
    padding: "inherit",
    pointerEvents: "none",
    position: "absolute",
    transitionDuration: motion.move,
    transitionProperty: {
      default: "none",
      [stylex.env.motionOk]: "clip-path",
    },
    transitionTimingFunction: motion.easeOut,
  },
});

/** For each option, the part of the group that it covers, as a clip path for the pill. */
const spotsOf = (group: HTMLElement): readonly string[] =>
  [...group.querySelectorAll<HTMLElement>("[data-option]")].map((option) => {
    const right = group.clientWidth - option.offsetLeft - option.offsetWidth;
    const bottom = group.clientHeight - option.offsetTop - option.offsetHeight;

    return `inset(${option.offsetTop}px ${right}px ${bottom}px ${option.offsetLeft}px round 9999px)`;
  });

/** No option is disabled unless the caller names some. */
const NONE: readonly never[] = [];

interface SegmentedProps<T extends string | number> {
  value: T;
  /** Each option is a value and what is shown for it. */
  options: readonly (readonly [T, ReactNode])[];
  onPick: (value: T) => void;
  /** The accessible name of the group. */
  label: string;
  /** Taller on a wide screen, for the main choice of a page. */
  large?: boolean;
  /** Options that are shown but cannot be chosen. */
  disabled?: readonly T[];
  /** The group fills its row and the options share the width equally. */
  stretch?: boolean;
  style?: StyleXStyles;
}

// Base UI gives the group one tab stop, arrow keys that move the choice, and a hidden input per option.
export const Segmented = <T extends string | number>({
  value,
  options,
  onPick,
  label,
  large = false,
  disabled = NONE,
  stretch = false,
  style,
}: SegmentedProps<T>) => {
  const group = useRef<HTMLDivElement>(null);

  // Where each option lies. Until the group has been measured, the chosen option carries
  // the colours itself.
  const [spots, setSpots] = useState<readonly string[]>(NONE);

  const spot = spots[options.findIndex(([option]) => option === value)] ?? null;

  // Measured again whenever the group changes size: with the text size setting, the font,
  // the width of the window, or other options.
  useLayoutEffect(() => {
    const element = group.current;

    const observer = new ResizeObserver(() => {
      setSpots(element === null ? NONE : spotsOf(element));
    });

    if (element !== null) {
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <RadioGroup<T>
      ref={group}
      value={value}
      onValueChange={(next) => {
        onPick(next);
      }}
      aria-label={label}
      {...stylex.props(styles.group, large && styles.groupLarge, style)}
    >
      {options.map(([option, name]) => {
        const off = disabled.includes(option);

        return (
          <Radio.Root<T>
            key={String(option)}
            value={option}
            disabled={off}
            data-option=""
            {...stylex.props(
              !off && effects.press,
              styles.option,
              large && styles.optionLarge,
              stretch && styles.optionStretch,
              off && styles.optionOff,
              spot === null && option === value && styles.chosen
            )}
          >
            {name}
          </Radio.Root>
        );
      })}
      {spot === null ? null : (
        <span
          aria-hidden="true"
          style={{ clipPath: spot }}
          {...stylex.props(styles.pill)}
        >
          {options.map(([option, name]) => (
            <span
              key={String(option)}
              {...stylex.props(
                styles.option,
                large && styles.optionLarge,
                stretch && styles.optionStretch
              )}
            >
              {name}
            </span>
          ))}
        </span>
      )}
    </RadioGroup>
  );
};
