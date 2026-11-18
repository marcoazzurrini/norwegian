import { stories, units } from "@norsk/content";
import type { Story } from "@norsk/content";
import { storyReady } from "@norsk/engine";
import { ListCard, PageTitle, Tag, effects } from "@norsk/ui";
import { color, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { AppShell } from "../components/app-shell";
import { useMemory, useProgress } from "../learner";

const styles = stylex.create({
  columns: {
    alignItems: "start",
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "repeat(2, minmax(0, 1fr))",
    },
  },
  // One list on a phone, two columns on a wide screen.
  phoneOnly: {
    display: { default: "flex", [stylex.env.desktop]: "none" },
  },
  wideOnly: {
    display: { default: "none", [stylex.env.desktop]: "flex" },
  },
  row: {
    alignItems: "center",
    display: "flex",
    gap: "1rem",
    paddingBlock: { default: "0.8125rem", [stylex.env.desktop]: "1.125rem" },
  },
  link: {
    color: color.fg,
    textDecoration: "none",
  },
  locked: {
    opacity: 0.5,
  },
  names: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    display: "block",
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s20 },
    fontWeight: 500,
  },
  about: {
    color: color.fg2,
    display: "block",
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    lineHeight: 1.45,
  },
  lock: {
    color: color.fg3,
    height: "1.125rem",
    width: "1.125rem",
  },
});

type StoryState = "read" | "new" | "locked";

interface StoryMarkProps {
  state: StoryState;
}

const StoryMark = ({ state }: StoryMarkProps) => {
  if (state === "read") {
    return <Tag tone="good">Read</Tag>;
  }

  if (state === "new") {
    return <Tag tone="new">New</Tag>;
  }

  return <Lock aria-label="Locked" {...stylex.props(styles.lock)} />;
};

interface StoryRowProps {
  story: Story;
  /** True if every word of the story has been taught. */
  ready: boolean;
  read: boolean;
}

const StoryRow = ({ story, ready, read }: StoryRowProps) => {
  const state = ready ? "new" : "locked";

  const body = (
    <>
      <span {...stylex.props(styles.names)}>
        <span {...stylex.props(styles.title)}>{story.title}</span>
        <span {...stylex.props(styles.about)}>
          {story.titleEn} · Unit {story.unit}: {units[story.unit - 1]?.name}
        </span>
      </span>
      <StoryMark state={read ? "read" : state} />
    </>
  );

  return ready ? (
    <Link
      to="/stories/$id"
      params={{ id: story.id }}
      {...stylex.props(effects.press, styles.row, styles.link)}
    >
      {body}
    </Link>
  ) : (
    <div {...stylex.props(styles.row, styles.locked)}>{body}</div>
  );
};

const StoriesPage = () => {
  const memory = useMemory();
  const { storiesDone } = useProgress();
  const half = Math.ceil(stories.length / 2);

  const rows = (list: Story[]) =>
    list.map((story) => (
      <StoryRow
        key={story.id}
        story={story}
        ready={storyReady(story, memory)}
        read={storiesDone.includes(story.id)}
      />
    ));

  return (
    <AppShell>
      <PageTitle
        title="Stories"
        sub="Short texts made only from words you have learned."
      />
      <div {...stylex.props(styles.columns)}>
        <ListCard style={styles.phoneOnly}>{rows(stories)}</ListCard>
        <ListCard style={styles.wideOnly}>
          {rows(stories.slice(0, half))}
        </ListCard>
        <ListCard style={styles.wideOnly}>{rows(stories.slice(half))}</ListCard>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/stories/")({ component: StoriesPage });
