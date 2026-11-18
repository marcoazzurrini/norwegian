import { sounds } from "@norsk/content";
import type { SoundPair } from "@norsk/content";
import { Button, Card, PageTitle, Progress } from "@norsk/ui";
import { color, text } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "../components/app-shell";
import {
  DRILL_LENGTH,
  drillFrom,
  soundGroups,
  voicesNote,
} from "../components/sound-drill";
import type { DrillQuestion, SoundGroup } from "../components/sound-drill";
import { SoundTask } from "../components/tasks/sound-task";
import { useApp } from "../engine/store";
import { useVoices } from "../lib/speech";

const styles = stylex.create({
  start: {
    width: { default: "100%", [stylex.env.desktop]: "auto" },
  },
  startIcon: {
    height: "1.125rem",
    width: "1.125rem",
  },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  groups: {
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "repeat(2, minmax(0, 1fr))",
      [stylex.env.desktopWide]: "repeat(3, minmax(0, 1fr))",
    },
  },
  head: {
    alignItems: "flex-start",
    display: "flex",
    gap: "0.75rem",
    justifyContent: "space-between",
  },
  names: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontSize: { default: text.s19, [stylex.env.desktop]: text.s26 },
    fontWeight: 500,
    letterSpacing: "-0.02em",
    lineHeight: 1.15,
  },
  hint: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    paddingTop: "0.25rem",
  },
  pairs: {
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s20 },
    fontWeight: 500,
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
  },
  grow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  score: {
    alignItems: "center",
    display: "flex",
    gap: "0.875rem",
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
  },
  scoreText: {
    color: color.fg2,
    flexShrink: 0,
    fontSize: text.s14,
    lineHeight: 1.45,
  },
  noScore: {
    color: color.fg3,
    fontSize: text.s14,
    lineHeight: 1.45,
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.25rem" },
  },
  note: {
    color: color.fg3,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s18 },
    margin: 0,
  },
});

interface GroupCardProps {
  group: SoundGroup;
  /** Right and total answers so far, if the group was ever practised. */
  score: { right: number; total: number } | undefined;
  onPractise: (pairs: SoundPair[]) => void;
}

const GroupCard = ({ group, score, onPractise }: GroupCardProps) => (
  <Card>
    <div {...stylex.props(styles.head)}>
      <div {...stylex.props(styles.names)}>
        <div {...stylex.props(styles.title)}>{group.title}</div>
        <div {...stylex.props(styles.hint)}>{group.hint}</div>
      </div>
      <Button
        variant="secondary"
        size="small"
        onClick={() => {
          onPractise(group.pairs);
        }}
      >
        Practise
      </Button>
    </div>
    <div {...stylex.props(styles.pairs)}>
      {group.pairs
        .map((pair) => `${pair.a.word} / ${pair.b.word}`)
        .join("  ·  ")}
    </div>
    <div {...stylex.props(styles.grow)} />
    {score !== undefined && score.total > 0 ? (
      <div {...stylex.props(styles.score)}>
        <Progress value={score.right / score.total} style={styles.grow} />
        <span {...stylex.props(styles.scoreText)}>
          {score.right} of {score.total} right
        </span>
      </div>
    ) : (
      <div {...stylex.props(styles.noScore)}>Not practised yet</div>
    )}
  </Card>
);

interface Drill {
  questions: DrillQuestion[];
  at: number;
}

const SoundsPage = () => {
  const { meta } = useApp();
  const voices = useVoices();
  const [drill, setDrill] = useState<Drill | null>(null);
  const groups = useMemo(() => soundGroups(sounds), []);
  const question = drill?.questions[drill.at];

  const start = (pairs: readonly SoundPair[]) => {
    setDrill({ at: 0, questions: drillFrom(pairs, Math.random) });
  };

  if (drill !== null && question !== undefined) {
    return (
      <SoundTask
        key={drill.at}
        pair={question.pair}
        target={question.target}
        index={drill.at}
        frame={{
          block: "sounds",
          label: `${drill.at + 1} of ${DRILL_LENGTH}`,
          onClose: () => {
            setDrill(null);
          },
          progress: drill.at / DRILL_LENGTH,
          title: "Sounds",
        }}
        onDone={() => {
          setDrill(
            drill.at + 1 < DRILL_LENGTH ? { ...drill, at: drill.at + 1 } : null
          );
        }}
      />
    );
  }

  return (
    <AppShell>
      <PageTitle
        title="Sounds"
        sub="Train your ear on the sounds that English does not have."
      >
        <Button
          onClick={() => {
            start(sounds);
          }}
          style={styles.start}
        >
          <Play {...stylex.props(styles.startIcon)} />
          Practise all sounds
        </Button>
      </PageTitle>
      <div {...stylex.props(styles.page)}>
        <div {...stylex.props(styles.groups)}>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              score={meta.sounds[group.id]}
              onPractise={start}
            />
          ))}
        </div>
        <p {...stylex.props(styles.note)}>
          {voicesNote(voices.map((voice) => voice.name))}
        </p>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/sounds")({ component: SoundsPage });
