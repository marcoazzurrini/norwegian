import { sentenceReady } from "@norsk/course";
import type { Item } from "@norsk/course";
import { itemState, retrievability } from "@norsk/engine";
import type { Memory } from "@norsk/engine";
import {
  AudioButton,
  Card,
  Display,
  GroupLabel,
  ListCard,
  PageTitle,
  Progress,
  Tag,
  effects,
  useDesktop,
} from "@norsk/ui";
import { color, radius, text, tracking } from "@norsk/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";
import { Ruler, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { itemGroups, memoryNote, splitAt } from "../../components/item-list";
import { LevelSwitch, useLevel } from "../../components/level-switch";
import { ITEM_LOOK } from "../../components/looks";
import { hasArticle, soundOf } from "../../components/tasks/items";
import { useCourse } from "../../course";
import { useMemory, useScheduler } from "../../learner";
import { speak } from "../../speech";

/** How many example sentences an item shows. */
const EXAMPLES = 4;

const styles = stylex.create({
  search: {
    alignItems: "center",
    backgroundColor: color.control,
    borderRadius: radius.pill,
    // A hairline inside the field while it has the focus.
    boxShadow: {
      default: null,
      ":focus-within": `inset 0 0 0 1px ${color.strong}`,
    },
    display: "flex",
    fontSize: text.s16,
    gap: "0.75rem",
    height: { default: "3rem", [stylex.env.desktop]: "3.25rem" },
    minWidth: 0,
    paddingInline: "1.125rem",
    width: "100%",
  },
  searchIcon: {
    color: color.fg3,
    flexShrink: 0,
    height: "1.125rem",
    width: "1.125rem",
  },
  searchField: {
    "::placeholder": { color: color.fg3 },
    backgroundColor: "transparent",
    borderWidth: 0,
    color: color.fg,
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontSize: text.s16,
    minWidth: 0,
    padding: 0,
  },
  // The same two columns as the content below, so that the level switch ends where the list ends.
  titleRow: {
    display: { default: "flex", [stylex.env.desktop]: "grid" },
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 35rem",
    },
  },
  columns: {
    alignItems: "start",
    display: "grid",
    gap: "1.25rem",
    gridTemplateColumns: {
      default: null,
      [stylex.env.desktop]: "minmax(0, 1fr) 35rem",
    },
  },
  groups: {
    display: "flex",
    flexDirection: "column",
    gap: { default: "1.25rem", [stylex.env.desktop]: "1.75rem" },
    minWidth: 0,
  },
  none: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    margin: 0,
  },
  group: {
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
  },
  groupName: {
    color: color.fg3,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    fontWeight: 500,
    lineHeight: 1.45,
    margin: 0,
    paddingInline: "0.25rem",
  },
  // The hairline above a row comes from the list card, so the row sets no border of its own on top.
  row: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    borderInlineWidth: 0,
    display: "flex",
    gap: "1rem",
    paddingBlock: { default: "0.8125rem", [stylex.env.desktop]: "1.125rem" },
    paddingInline: 0,
    textAlign: "left",
    width: "100%",
  },
  rowName: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
    fontSize: { default: text.s17, [stylex.env.desktop]: text.s20 },
    fontWeight: 500,
    minWidth: 0,
  },
  rowNameChosen: {
    fontWeight: 600,
  },
  rowGloss: {
    color: color.fg2,
    fontWeight: 400,
    paddingLeft: "0.625rem",
  },
  side: {
    display: { default: "none", [stylex.env.desktop]: "block" },
    position: "sticky",
    top: 0,
  },
  roomy: {
    padding: { default: "1.125rem", [stylex.env.desktop]: "2rem" },
  },
  prompt: {
    color: color.fg2,
    fontSize: text.s18,
  },
  head: {
    alignItems: "center",
    display: "flex",
    gap: { default: "0.875rem", [stylex.env.desktop]: "1.25rem" },
  },
  headAudio: {
    height: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
    width: { default: "3rem", [stylex.env.desktop]: "3.75rem" },
  },
  shrinks: {
    minWidth: 0,
  },
  title: {
    fontSize: { default: text.s30, [stylex.env.desktop]: text.s44 },
    fontWeight: 500,
    letterSpacing: tracking.tight,
    lineHeight: 1.1,
    overflowWrap: "break-word",
  },
  gloss: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s20 },
  },
  facts: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "0.625rem",
    paddingBottom: { default: "0.25rem", [stylex.env.desktop]: "0.375rem" },
    paddingTop: { default: "0.875rem", [stylex.env.desktop]: "1.375rem" },
  },
  sound: {
    color: color.fg2,
    fontSize: text.s16,
  },
  melody: {
    color: color.fg3,
    fontSize: text.s14,
  },
  label: {
    paddingBottom: "0.5rem",
    paddingTop: { default: "0.75rem", [stylex.env.desktop]: "1.375rem" },
  },
  labelLower: {
    paddingBottom: "0.5rem",
    paddingTop: { default: "0.875rem", [stylex.env.desktop]: "1.625rem" },
  },
  pair: {
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    display: "flex",
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    gap: "1rem",
    justifyContent: "space-between",
    paddingBlock: { default: "0.5625rem", [stylex.env.desktop]: "0.75rem" },
  },
  quiet: {
    color: color.fg2,
  },
  quietRight: {
    color: color.fg2,
    textAlign: "right",
  },
  strong: {
    fontWeight: 500,
  },
  rule: {
    color: color.fg2,
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    margin: 0,
    paddingBottom: "0.5rem",
  },
  meter: {
    alignItems: "center",
    display: "flex",
    gap: "0.875rem",
  },
  grow: {
    flexBasis: "0%",
    flexGrow: 1,
    flexShrink: 1,
  },
  percent: {
    fontSize: text.s16,
    fontWeight: 500,
  },
  note: {
    color: color.fg2,
    fontSize: { default: text.s14, [stylex.env.desktop]: text.s16 },
    lineHeight: 1.45,
    margin: 0,
    paddingTop: "0.625rem",
  },
  sentence: {
    alignItems: "center",
    borderColor: color.line,
    borderStyle: "solid",
    borderTopWidth: 1,
    borderWidth: 0,
    display: "flex",
    gap: "0.875rem",
    paddingBlock: { default: "0.625rem", [stylex.env.desktop]: "0.75rem" },
  },
  sentenceAudio: {
    height: "2.25rem",
    width: "2.25rem",
  },
  target: {
    fontSize: { default: text.s16, [stylex.env.desktop]: text.s18 },
    fontWeight: 500,
  },
  base: {
    color: color.fg2,
    fontSize: text.s14,
    lineHeight: 1.45,
  },
});

const say = (words: string) => {
  speak(words).catch(reportError);
};

interface ItemDetailProps {
  shown: Item;
  /** The moment the page was opened: the memory is described as it was then. */
  now: number;
}

const ItemDetail = ({ shown, now }: ItemDetailProps) => {
  const course = useCourse();
  const memory = useMemory();
  const scheduler = useScheduler();
  const mem = memory.get(shown.id);
  const isPattern = shown.kind === "pattern";

  const examples = course
    .sentencesWith(shown.id)
    .filter((sentence) => sentenceReady(sentence, memory))
    .slice(0, EXAMPLES);

  const recall = mem === undefined ? 0 : retrievability(scheduler, mem, now);

  const look = ITEM_LOOK[itemState(course, shown, memory)];
  const forms = shown.forms ?? [];

  return (
    <Card style={[effects.rise, styles.roomy]}>
      <div {...stylex.props(styles.head)}>
        {isPattern ? null : (
          <AudioButton
            onPlay={() => {
              say(shown.display);
            }}
            style={styles.headAudio}
          />
        )}
        <div {...stylex.props(styles.shrinks)}>
          <div {...stylex.props(styles.title)}>
            {isPattern ? (
              shown.title
            ) : (
              <Display text={shown.display} split={hasArticle(shown)} />
            )}
          </div>
          {isPattern ? null : (
            <div {...stylex.props(styles.gloss)}>{shown.gloss}</div>
          )}
        </div>
      </div>
      <div {...stylex.props(styles.facts)}>
        <Tag tone={look.tone}>{look.label}</Tag>
        {shown.ipa === undefined ? null : (
          <span {...stylex.props(styles.sound)}>/{soundOf(shown.ipa)}/</span>
        )}
        {shown.tone === undefined ? null : (
          <span {...stylex.props(styles.melody)}>
            {course.meta.tones[shown.tone]}
          </span>
        )}
      </div>

      {forms.length > 1 ? (
        <>
          <GroupLabel style={styles.label}>Forms</GroupLabel>
          {forms.map((row) => (
            <div key={row.label} {...stylex.props(styles.pair)}>
              <span {...stylex.props(styles.quiet)}>{row.label}</span>
              <span {...stylex.props(styles.strong)}>{row.form}</span>
            </div>
          ))}
        </>
      ) : null}

      {shown.rule === undefined ? null : (
        <>
          <GroupLabel style={styles.label}>The rule</GroupLabel>
          {shown.rule.map((line) => (
            <p key={line} {...stylex.props(styles.rule)}>
              {line}
            </p>
          ))}
          {shown.examples?.map((example) => (
            <div key={example.target} {...stylex.props(styles.pair)}>
              <span {...stylex.props(styles.strong)}>
                {example.target.replace(">", "→")}
              </span>
              <span {...stylex.props(styles.quietRight)}>{example.base}</span>
            </div>
          ))}
        </>
      )}

      {mem === undefined ? null : (
        <>
          <GroupLabel style={styles.labelLower}>Memory</GroupLabel>
          <div {...stylex.props(styles.meter)}>
            <Progress value={recall} tone="good" style={styles.grow} />
            <span {...stylex.props(styles.percent)}>
              {Math.round(recall * 100)}%
            </span>
          </div>
          <p {...stylex.props(styles.note)}>
            Chance you recall it now. Lasts about {memoryNote(mem, now).lasts}.
            {` Next review: ${memoryNote(mem, now).next}.`}
          </p>
        </>
      )}

      {examples.length > 0 ? (
        <>
          <GroupLabel style={styles.labelLower}>
            Sentences you can read
          </GroupLabel>
          {examples.map((sentence) => (
            <div key={sentence.id} {...stylex.props(styles.sentence)}>
              <AudioButton
                onPlay={() => {
                  say(sentence.target);
                }}
                style={styles.sentenceAudio}
              />
              <div {...stylex.props(styles.shrinks)}>
                <div {...stylex.props(styles.target)}>{sentence.target}</div>
                <div {...stylex.props(styles.base)}>{sentence.base}</div>
              </div>
            </div>
          ))}
        </>
      ) : null}
    </Card>
  );
};

interface ItemRowProps {
  shown: Item;
  memory: Memory;
  chosen: boolean;
  onPick: (id: string) => void;
}

const ItemRow = ({ shown, memory, chosen, onPick }: ItemRowProps) => {
  const course = useCourse();
  const look = ITEM_LOOK[itemState(course, shown, memory)];
  const isPattern = shown.kind === "pattern";

  return (
    <button
      type="button"
      onClick={() => {
        onPick(shown.id);
      }}
      aria-expanded={chosen}
      {...stylex.props(effects.press, styles.row)}
    >
      <span {...stylex.props(styles.rowName, chosen && styles.rowNameChosen)}>
        {isPattern ? shown.title : shown.display}
        {isPattern ? null : (
          <span {...stylex.props(styles.rowGloss)}>{shown.gloss}</span>
        )}
      </span>
      {isPattern ? (
        <Tag icon={Ruler}>Pattern</Tag>
      ) : (
        <Tag tone={look.tone}>{look.label}</Tag>
      )}
    </button>
  );
};

interface RowsProps {
  list: Item[];
  memory: Memory;
  selected: string | null;
  onPick: (id: string) => void;
}

const Rows = ({ list, memory, selected, onPick }: RowsProps) => (
  <ListCard>
    {list.map((one) => (
      <ItemRow
        key={one.id}
        shown={one}
        memory={memory}
        chosen={selected === one.id}
        onPick={onPick}
      />
    ))}
  </ListCard>
);

const ItemsPage = () => {
  const course = useCourse();
  const memory = useMemory();
  const { openedAt } = Route.useLoaderData();
  const desktop = useDesktop();
  const searchId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [level, pickLevel] = useLevel(memory);

  const groups = useMemo(
    () => itemGroups(course, query, level),
    [course, query, level]
  );

  const taught = course.levelItems(level);
  const learned = taught.filter((id) => memory.has(id)).length;

  const pick = (id: string) => {
    setSelected(selected === id ? null : id);
  };

  return (
    <AppShell>
      <PageTitle
        title="Items"
        sub={`${learned} of ${taught.length} learned in ${level.id}.`}
        style={styles.titleRow}
        aside={
          <label htmlFor={searchId} {...stylex.props(styles.search)}>
            <Search {...stylex.props(styles.searchIcon)} />
            <input
              id={searchId}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder={`Search ${course.meta.name} or ${course.meta.base}`}
              aria-label="Search items"
              {...stylex.props(styles.searchField)}
            />
          </label>
        }
      >
        <LevelSwitch
          level={level}
          memory={memory}
          onPick={(id) => {
            pickLevel(id);
            setSelected(null);
          }}
        />
      </PageTitle>
      <div {...stylex.props(styles.columns)}>
        <div {...stylex.props(styles.groups)}>
          {groups.length === 0 ? (
            <p {...stylex.props(styles.none)}>
              No item matches “{query.trim()}”.
            </p>
          ) : null}
          {groups.map(({ unit, list }) => {
            // On a phone the details open right under the chosen row, so the list is cut in two around them.
            const cut = desktop ? null : splitAt(list, selected);

            return (
              <section key={unit.index} {...stylex.props(styles.group)}>
                <h2 {...stylex.props(styles.groupName)}>
                  Unit {unit.index}: {unit.name}
                </h2>
                {cut === null ? (
                  <Rows
                    list={list}
                    memory={memory}
                    selected={selected}
                    onPick={pick}
                  />
                ) : (
                  <>
                    <Rows
                      list={cut.before}
                      memory={memory}
                      selected={selected}
                      onPick={pick}
                    />
                    <ItemDetail
                      key={cut.chosen.id}
                      shown={cut.chosen}
                      now={openedAt}
                    />
                    {cut.after.length > 0 ? (
                      <Rows
                        list={cut.after}
                        memory={memory}
                        selected={selected}
                        onPick={pick}
                      />
                    ) : null}
                  </>
                )}
              </section>
            );
          })}
        </div>
        <div {...stylex.props(styles.side)}>
          {selected === null ? (
            <Card style={[styles.roomy, styles.prompt]}>
              Choose an item to see its forms, sound and memory.
            </Card>
          ) : (
            <ItemDetail
              key={selected}
              shown={course.item(selected)}
              now={openedAt}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
};

export const Route = createFileRoute("/$course/items")({
  component: ItemsPage,
  loader: () => ({ openedAt: Date.now() }),
});
