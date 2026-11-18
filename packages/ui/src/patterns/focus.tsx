// One task per screen: where you are on top, the exchange in a narrow column, the action at the bottom.
import * as stylex from "@stylexjs/stylex";
import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { Blob } from "../components/blob";
import type { BlobKind } from "../components/blob";
import { IconButton } from "../components/icon-button";
import { Progress } from "../components/progress";
import { effects } from "../tokens/effects";
import { color, radius, text } from "../tokens/tokens.stylex";

const styles = stylex.create({
  frame: {
    backgroundColor: { default: color.panel, [stylex.env.desktop]: color.base },
    display: "flex",
    flexDirection: "column",
    height: "100dvh",
    padding: { default: null, [stylex.env.desktop]: "0.625rem" },
  },
  panel: {
    backgroundColor: color.panel,
    borderRadius: { default: null, [stylex.env.desktop]: radius.r24 },
    display: "flex",
    flexBasis: "0%",
    flexDirection: "column",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    paddingBottom: { default: "0.5rem", [stylex.env.desktop]: "1.25rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: "1.5rem" },
    paddingTop: {
      default: "calc(max(env(safe-area-inset-top), 0.5rem) + 0.25rem)",
      [stylex.env.desktop]: "1.25rem",
    },
  },
  close: {
    display: "flex",
  },
  activity: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    display: "inline-flex",
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    fontWeight: 500,
    gap: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    height: { default: "2.25rem", [stylex.env.desktop]: "2.75rem" },
    paddingLeft: { default: "0.5rem", [stylex.env.desktop]: "0.625rem" },
    paddingRight: { default: "0.875rem", [stylex.env.desktop]: "1.125rem" },
  },
  activityBlob: {
    height: { default: "1.375rem", [stylex.env.desktop]: "1.625rem" },
    width: { default: "1.375rem", [stylex.env.desktop]: "1.625rem" },
  },
  place: {
    alignItems: "center",
    display: "flex",
    gap: "0.875rem",
    justifyContent: "flex-end",
    paddingRight: { default: "0.125rem", [stylex.env.desktop]: "0.5rem" },
  },
  // On a wide screen the bar sits beside the label; on a phone it runs under the header.
  wideBar: {
    display: { default: "none", [stylex.env.desktop]: "block" },
    height: "0.25rem",
    width: "10rem",
  },
  phoneBarRow: {
    display: { default: null, [stylex.env.desktop]: "none" },
    paddingInline: "1rem",
  },
  phoneBar: {
    height: "3px",
  },
  label: {
    color: color.fg2,
    fontSize: { default: text.s13, [stylex.env.desktop]: text.s15 },
    fontWeight: 500,
    whiteSpace: "nowrap",
  },
  stage: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  exchange: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "0.625rem", [stylex.env.desktop]: "0.875rem" },
    justifyContent: "center",
    marginInline: "auto",
    maxWidth: "100%",
    minHeight: "100%",
    paddingBlock: { default: "0.75rem", [stylex.env.desktop]: "1rem" },
    paddingInline: { default: "1rem", [stylex.env.desktop]: 0 },
    width: "100%",
  },
  dock: {
    marginInline: "auto",
    maxWidth: "100%",
    minHeight: { default: null, [stylex.env.desktop]: "7.75rem" },
    paddingBottom: {
      default: "max(calc(env(safe-area-inset-bottom) + 0.5rem), 1rem)",
      [stylex.env.desktop]: "3rem",
    },
    paddingInline: { default: "1rem", [stylex.env.desktop]: 0 },
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
    width: "100%",
  },
  narrow: {
    width: { default: "100%", [stylex.env.desktop]: "55rem" },
  },
  wide: {
    width: { default: "100%", [stylex.env.desktop]: "65rem" },
  },
  closeIcon: {
    height: "1.125rem",
    width: "1.125rem",
  },
});

interface FocusProps {
  /** The activity, shown as a pill in the middle of the top bar. */
  block: BlobKind;
  title: string;
  /** Short text beside the progress bar, such as "12 min left". */
  label: string;
  /** From 0 to 1. */
  progress: number;
  onClose: () => void;
  children: ReactNode;
  /** The composer or the buttons at the bottom. */
  dock?: ReactNode;
  /** When this value changes, the exchange scrolls to its newest part. */
  scrollKey?: unknown;
  /** A wider column, for the summary at the end of a session. */
  wide?: boolean;
}

export const Focus = ({
  block,
  title,
  label,
  progress,
  onClose,
  children,
  dock,
  scrollKey,
  wide = false,
}: FocusProps) => {
  const stage = useRef<HTMLDivElement>(null);
  const lastKey = useRef(scrollKey);

  useEffect(() => {
    // The first render starts at the top; only a new key scrolls.
    if (Object.is(lastKey.current, scrollKey)) {
      return;
    }

    lastKey.current = scrollKey;

    const element = stage.current;

    element?.scrollTo({ behavior: "smooth", top: element.scrollHeight });
  }, [scrollKey]);

  const column = wide ? styles.wide : styles.narrow;

  return (
    <div {...stylex.props(styles.frame)}>
      <div {...stylex.props(styles.panel)}>
        <header {...stylex.props(styles.header)}>
          <div {...stylex.props(styles.close)}>
            <IconButton label="Close" onClick={onClose}>
              <X {...stylex.props(styles.closeIcon)} />
            </IconButton>
          </div>
          <div {...stylex.props(styles.activity)}>
            <Blob kind={block} style={styles.activityBlob} />
            {title}
          </div>
          <div {...stylex.props(styles.place)}>
            <Progress value={progress} style={styles.wideBar} />
            <span {...stylex.props(styles.label)}>{label}</span>
          </div>
        </header>
        <div {...stylex.props(styles.phoneBarRow)}>
          <Progress value={progress} style={styles.phoneBar} />
        </div>

        <div ref={stage} {...stylex.props(styles.stage, effects.noScrollbar)}>
          <div {...stylex.props(styles.exchange, column)}>{children}</div>
        </div>

        <footer {...stylex.props(styles.dock, column)}>{dock}</footer>
      </div>
    </div>
  );
};
