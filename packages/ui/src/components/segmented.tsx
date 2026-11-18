// A row of options of which exactly one is chosen.
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  group: {
    backgroundColor: color.control,
    borderRadius: radius.pill,
    display: "inline-flex",
    fontSize: text.s15,
    fontWeight: 500,
    maxWidth: "100%",
    padding: "0.25rem",
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
    height: "2.125rem",
    paddingInline: "0.875rem",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  optionLarge: {
    height: { default: "2.125rem", [stylex.env.desktop]: "2.5rem" },
    paddingInline: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
  },
  chosen: {
    backgroundColor: color.inverse,
    color: color.onInverse,
  },
});

interface SegmentedProps<T extends string | number> {
  value: T;
  /** Each option is a value and the text shown for it. */
  options: readonly (readonly [T, string])[];
  onPick: (value: T) => void;
  /** The accessible name of the group. */
  label: string;
  /** Taller on a wide screen, for the main choice of a page. */
  large?: boolean;
  style?: StyleXStyles;
}

// Base UI gives the group one tab stop, arrow keys that move the choice, and a hidden input per option.
export const Segmented = <T extends string | number>({
  value,
  options,
  onPick,
  label,
  large = false,
  style,
}: SegmentedProps<T>) => (
  <RadioGroup<T>
    value={value}
    onValueChange={(next) => {
      onPick(next);
    }}
    aria-label={label}
    {...stylex.props(styles.group, large && styles.groupLarge, style)}
  >
    {options.map(([option, name]) => (
      <Radio.Root<T>
        key={String(option)}
        value={option}
        {...stylex.props(
          effects.press,
          styles.option,
          large && styles.optionLarge,
          option === value && styles.chosen
        )}
      >
        {name}
      </Radio.Root>
    ))}
  </RadioGroup>
);
