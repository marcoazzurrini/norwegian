import { items, lessons, sentencesWith, units } from "@norsk/content";
import type { Item } from "@norsk/content";
import { createFileRoute } from "@tanstack/react-router";
import { Ruler, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Shell } from "../components/Shell";
import { hasArticle } from "../components/tasks/shared";
import {
  AudioButton,
  Card,
  Display,
  Label,
  ListCard,
  PageTitle,
  Progress,
  Tag,
  useDesktop,
} from "../components/ui";
import type { TagTone } from "../components/ui";
import { retrievability } from "../engine/memory";
import { itemState, sentenceReady } from "../engine/select";
import type { ItemState, Memory } from "../engine/select";
import { getScheduler, useApp } from "../engine/store";

export const Route = createFileRoute("/items")({ component: ItemsPage });

const STATE: Record<ItemState, { label: string; tone: TagTone }> = {
  stable: { label: "Stable", tone: "good" },
  learning: { label: "Learning", tone: "progress" },
  ready: { label: "Ready", tone: "new" },
  locked: { label: "Locked", tone: "neutral" },
};

const TONE_NAME = {
  1: "Melody 1: low, then rising",
  2: "Melody 2: dips, then rises",
};

function ItemDetail({ it }: { it: Item }) {
  const { memory } = useApp();
  const m = memory.get(it.id);

  const examples = sentencesWith(it.id)
    .filter((s) => sentenceReady(s, memory))
    .slice(0, 4);

  const recall = m ? retrievability(getScheduler(), m, Date.now()) : 0;
  const due = m ? new Date(m.card.dueAt) : null;
  const state = STATE[itemState(it, memory)];

  const rowClass =
    "flex justify-between gap-4 border-t border-line py-[0.5625rem] text-16 lg:py-3 lg:text-18";

  return (
    <Card className="rise lg:!p-8">
      <div className="flex items-center gap-3.5 lg:gap-5">
        {it.kind !== "pattern" && (
          <AudioButton text={it.text} className="size-12 lg:size-[3.75rem]" />
        )}
        <div className="min-w-0">
          <div className="text-30 lg:text-44 leading-[1.1] font-medium tracking-[-0.03em] break-words">
            {it.kind === "pattern" ? (
              it.title
            ) : (
              <Display text={it.display} split={hasArticle(it)} />
            )}
          </div>
          {it.kind !== "pattern" && (
            <div className="text-16 text-fg2 lg:text-20">{it.gloss}</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2.5 pt-3.5 pb-1 lg:pt-[1.375rem] lg:pb-1.5">
        <Tag tone={state.tone}>{state.label}</Tag>
        {it.ipa && (
          <span className="text-16 text-fg2">
            /{it.ipa.replaceAll("ˈ", "")}/
          </span>
        )}
        {it.tone && (
          <span className="text-14 text-fg3">{TONE_NAME[it.tone]}</span>
        )}
      </div>

      {it.forms && it.forms.length > 1 && (
        <>
          <Label className="pt-3 pb-2 lg:pt-[1.375rem]">Forms</Label>
          {it.forms.map((f) => (
            <div key={f.label} className={rowClass}>
              <span className="text-fg2">{f.label}</span>
              <span className="font-medium">{f.form}</span>
            </div>
          ))}
        </>
      )}

      {it.rule && (
        <>
          <Label className="pt-3 pb-2 lg:pt-[1.375rem]">The rule</Label>
          {it.rule.map((r) => (
            <p key={r} className="text-16 text-fg2 lg:text-18 m-0 pb-2">
              {r}
            </p>
          ))}
          {it.examples?.map((e) => (
            <div key={e.no} className={rowClass}>
              <span className="font-medium">{e.no.replace(">", "→")}</span>
              <span className="text-fg2 text-right">{e.en}</span>
            </div>
          ))}
        </>
      )}

      {m && (
        <>
          <Label className="pt-3.5 pb-2 lg:pt-[1.625rem]">Memory</Label>
          <div className="flex items-center gap-3.5">
            <Progress value={recall} fill="bg-green" className="flex-1" />
            <span className="text-16 font-medium">
              {Math.round(recall * 100)}%
            </span>
          </div>
          <p className="text-14 text-fg2 lg:text-16 m-0 pt-2.5 leading-[1.45]">
            Chance you recall it now. Lasts about{" "}
            {m.card.stability < 1
              ? "less than a day"
              : `${Math.round(m.card.stability)} days`}
            .
            {due &&
              ` Next review: ${due.getTime() <= Date.now() ? "now" : due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`}
          </p>
        </>
      )}

      {examples.length > 0 && (
        <>
          <Label className="pt-3.5 pb-2 lg:pt-[1.625rem]">
            Sentences you can read
          </Label>
          {examples.map((s) => (
            <div
              key={s.id}
              className="border-line flex items-center gap-3.5 border-t py-2.5 lg:py-3"
            >
              <AudioButton text={s.no} className="size-9" />
              <div className="min-w-0">
                <div className="text-16 lg:text-18 font-medium">{s.no}</div>
                <div className="text-14 text-fg2 leading-[1.45]">{s.en}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

function ItemRow({
  it,
  memory,
  selected,
  onPick,
}: {
  it: Item;
  memory: Memory;
  selected: boolean;
  onPick: () => void;
}) {
  const s = itemState(it, memory);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-expanded={selected}
      className="press flex w-full items-center gap-4 border-x-0 border-b-0 bg-transparent px-0 py-[0.8125rem] text-left lg:py-[1.125rem]"
    >
      <span
        className={`text-17 lg:text-20 min-w-0 flex-1 ${selected ? "font-semibold" : "font-medium"}`}
      >
        {it.kind === "pattern" ? it.title : it.display}
        {it.kind !== "pattern" && (
          <span className="text-fg2 pl-2.5 font-normal">{it.gloss}</span>
        )}
      </span>
      {it.kind === "pattern" ? (
        <Tag icon={Ruler}>Pattern</Tag>
      ) : (
        <Tag tone={STATE[s].tone}>{STATE[s].label}</Tag>
      )}
    </button>
  );
}

function ItemsPage() {
  const { memory } = useApp();
  const desktop = useDesktop();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const q = query.trim().toLowerCase();

  const groups = useMemo(
    () =>
      units
        .map((u) => ({
          unit: u,
          list: u.lessons
            .flatMap((li) => lessons[li].items)
            .map((id) => items[id])
            .filter(
              (it) =>
                !q ||
                it.text.toLowerCase().includes(q) ||
                it.gloss.toLowerCase().includes(q)
            ),
        }))
        .filter((g) => g.list.length),
    [q]
  );

  const rows = (list: Item[]) =>
    list.map((it) => (
      <ItemRow
        key={it.id}
        it={it}
        memory={memory}
        selected={selected === it.id}
        onPick={() => {
          setSelected(selected === it.id ? null : it.id);
        }}
      />
    ));

  return (
    <Shell>
      <PageTitle
        title="Items"
        sub={`${memory.size} of ${Object.keys(items).length} learned.`}
      >
        <label className="bg-control text-16 flex h-12 w-full items-center gap-3 rounded-full px-[1.125rem] focus-within:shadow-[inset_0_0_0_1px_var(--color-strong)] lg:h-[3.25rem] lg:w-[32.5rem]">
          <Search className="text-fg3 size-[1.125rem] shrink-0" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Search Norwegian or English"
            aria-label="Search items"
            className="text-16 text-fg placeholder:text-fg3 min-w-0 flex-1 border-0 bg-transparent p-0"
          />
        </label>
      </PageTitle>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_35rem]">
        <div className="flex min-w-0 flex-col gap-5 lg:gap-7">
          {groups.length === 0 && (
            <p className="text-16 text-fg2 lg:text-18 m-0">
              No item matches “{query.trim()}”.
            </p>
          )}
          {groups.map(({ unit, list }) => {
            // On a phone the details open right under the chosen row, so the list is cut in two around them.
            const at = desktop
              ? -1
              : list.findIndex((it) => it.id === selected);

            return (
              <section key={unit.index} className="flex flex-col gap-2.5">
                <h2 className="text-14 text-fg3 lg:text-16 m-0 px-1 leading-[1.45] font-medium">
                  Unit {unit.index}: {unit.name}
                </h2>
                {at < 0 ? (
                  <ListCard>{rows(list)}</ListCard>
                ) : (
                  <>
                    <ListCard>{rows(list.slice(0, at + 1))}</ListCard>
                    <ItemDetail key={selected} it={list[at]} />
                    {at + 1 < list.length && (
                      <ListCard>{rows(list.slice(at + 1))}</ListCard>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
        <div className="sticky top-0 hidden lg:block">
          {selected ? (
            <ItemDetail key={selected} it={items[selected]} />
          ) : (
            <Card className="text-18 text-fg2 lg:!p-8">
              Choose an item to see its forms, sound and memory.
            </Card>
          )}
        </div>
      </div>
    </Shell>
  );
}
