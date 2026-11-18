import { items, units } from "@norsk/content";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useMemo } from "react";

import { Shell } from "../components/Shell";
import {
  Blob,
  Card,
  Chip,
  Progress,
  Segmented,
  buttonClass,
} from "../components/ui";
import type { BlobKind } from "../components/ui";
import { isStable, retrievability } from "../engine/memory";
import { compression, dueItems, nextLesson, nextStory } from "../engine/select";
import { getScheduler, updateSettings, useApp } from "../engine/store";

export const Route = createFileRoute("/")({ component: Today });

/** Hours a solo learner needs to reach A1 (docs/spec.md, section 4). */
const HOURS_TO_A1 = 100;
const LENGTHS = [5, 15, 25, 40];

function greeting(): [string, string] {
  const h = new Date().getHours();

  if (h < 10) {
    return ["God morgen", "Good morning"];
  }

  if (h < 18) {
    return ["God dag", "Good day"];
  }

  return ["God kveld", "Good evening"];
}

function PlanRow({
  kind,
  title,
  detail,
}: {
  kind: BlobKind;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3.5 p-2.5 lg:gap-[1.125rem] lg:px-4 lg:py-3.5">
      <Blob kind={kind} className="size-11 lg:size-[3.25rem]" />
      <div className="min-w-0 flex-1">
        <div className="text-16 lg:text-18 font-medium">{title}</div>
        <div className="text-14 text-fg2 lg:text-16">{detail}</div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-30 lg:text-44 leading-[1.1] font-medium tracking-[-0.03em]">
        {value}
      </div>
      <div className="text-14 text-fg3 lg:text-16 leading-[1.45]">{label}</div>
    </div>
  );
}

function Today() {
  const { memory, meta } = useApp();
  const { minutes } = meta.settings;
  const [no, en] = greeting();

  const view = useMemo(() => {
    const now = Date.now();
    const scheduler = getScheduler();
    const mems = [...memory.values()];
    const lesson = nextLesson(memory, meta.chosenLesson);
    const first = lesson?.items.find((id) => !memory.has(id));

    return {
      comp: compression(memory, now),
      learning: dueItems(memory, now).learning.length,
      lesson,
      firstNew: first ? items[first] : null,
      story: nextStory(memory, new Set(meta.storiesDone)),
      stable: mems.filter(isStable).length,
      inLearning: mems.filter((m) => !isStable(m)).length,
      recall: mems.length
        ? mems.reduce((sum, m) => sum + retrievability(scheduler, m, now), 0) /
          mems.length
        : 0,
    };
  }, [memory, meta.chosenLesson, meta.storiesDone]);

  const hours = meta.totalMs / 3_600_000;
  const total = Object.keys(items).length;
  const due = view.comp.due + view.learning;

  // One line that says what today holds.
  const parts = [
    due ? `${due} ${due === 1 ? "review" : "reviews"}` : "",
    view.firstNew
      ? view.firstNew.kind === "pattern"
        ? "one new pattern"
        : "new words"
      : "",
  ].filter(Boolean);

  const summary = parts.length
    ? `${parts.join(" and ")}${due ? "" : " to learn"}.`
    : "Nothing is due right now.";

  return (
    <Shell>
      <div className="flex flex-col items-center gap-3.5 pt-3 text-center lg:gap-[1.625rem] lg:pt-12">
        <Chip strong={`${en}.`}>
          {meta.days.length ? `Day ${meta.days.length}` : undefined}
        </Chip>
        <h1 className="text-hero m-0 leading-none font-medium tracking-[-0.035em]">
          {no}
        </h1>
        <p className="text-17 text-fg2 lg:text-22 m-0 first-letter:uppercase">
          {summary}
        </p>
        <div className="flex w-full flex-col items-center gap-3 pt-2 lg:w-auto lg:flex-row lg:pt-3">
          <Link
            to="/session"
            search={{ minutes }}
            className={buttonClass("primary", "large", "w-full lg:w-auto")}
          >
            <Play className="size-[1.125rem]" />
            Start session
          </Link>
          <Segmented
            large
            label="Session length"
            value={minutes}
            options={LENGTHS.map((m) => [m, `${m} min`])}
            onPick={(m) => void updateSettings({ minutes: m })}
          />
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_28.75rem] lg:pt-7">
        <div className="border-line bg-inset flex flex-col gap-0.5 rounded-[1.375rem] border p-1.5 lg:rounded-[1.75rem] lg:p-2.5">
          {minutes >= 15 && (
            <PlanRow
              kind="sounds"
              title="Sounds"
              detail="Two similar words. Which one do you hear?"
            />
          )}
          <PlanRow
            kind="review"
            title="Review"
            detail={
              due
                ? `${due} ${due === 1 ? "item is" : "items are"} due.${view.comp.due > 1 && view.comp.tasks < view.comp.due ? ` ${view.comp.tasks} reviews cover ${view.comp.due} of them.` : ""}`
                : "Nothing is due."
            }
          />
          <PlanRow
            kind="new"
            title="New"
            detail={
              view.lesson
                ? `Unit ${view.lesson.unit}, ${units[view.lesson.unit - 1].name}: ${view.lesson.title}.${view.firstNew ? (view.firstNew.kind === "pattern" ? ` Pattern: ${view.firstNew.title}.` : ` Next: ${view.firstNew.display}.`) : ""}`
                : "You have learned every lesson."
            }
          />
          {minutes >= 15 && (
            <PlanRow
              kind="story"
              title="Story"
              detail={
                view.story
                  ? `${view.story.title}. Made from words you know.`
                  : "A story unlocks after a few more lessons."
              }
            />
          )}
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="text-15 text-fg2 lg:text-18">Progress to A1</div>
            <div className="text-30 lg:text-44 pt-2 leading-[1.1] font-medium tracking-[-0.03em]">
              {Math.round((hours / HOURS_TO_A1) * 100)}%
            </div>
            <div className="flex flex-col gap-2.5 pt-3.5">
              <Progress value={hours / HOURS_TO_A1} />
              <div className="text-14 text-fg3 lg:text-16 leading-[1.45]">
                {hours.toFixed(1)} of about {HOURS_TO_A1} hours
              </div>
            </div>
          </Card>
          <Card>
            <div className="text-15 text-fg2 lg:text-18">Items</div>
            <div className="flex gap-8 pt-2 lg:gap-10">
              <Stat value={view.stable} label="Stable" />
              <Stat value={view.inLearning} label="Learning" />
              <Stat value={total - memory.size} label="To learn" />
            </div>
          </Card>
          <Card>
            <div className="text-15 text-fg2 lg:text-18">Memory</div>
            <div className="pt-2">
              <Stat
                value={memory.size ? `${Math.round(view.recall * 100)}%` : "–"}
                label="of learned items you would recall right now"
              />
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
