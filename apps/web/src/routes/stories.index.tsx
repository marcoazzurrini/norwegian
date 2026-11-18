import { stories, units } from "@norsk/content";
import type { Story } from "@norsk/content";
import { storyReady } from "@norsk/engine";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";

import { Shell } from "../components/Shell";
import { ListCard, PageTitle, Tag } from "../components/ui";
import { useApp } from "../engine/store";

export const Route = createFileRoute("/stories/")({ component: StoriesPage });

function StoriesPage() {
  const { memory, meta } = useApp();
  const half = Math.ceil(stories.length / 2);

  const row = (st: Story) => {
    const ready = storyReady(st, memory);
    const read = meta.storiesDone.includes(st.id);

    const body = (
      <>
        <span className="min-w-0 flex-1">
          <span className="text-17 lg:text-20 block font-medium">
            {st.title}
          </span>
          <span className="text-14 text-fg2 lg:text-16 block leading-[1.45]">
            {st.titleEn} · Unit {st.unit}: {units[st.unit - 1].name}
          </span>
        </span>
        {read ? (
          <Tag tone="good">Read</Tag>
        ) : ready ? (
          <Tag tone="new">New</Tag>
        ) : (
          <Lock className="text-fg3 size-[1.125rem]" aria-label="Locked" />
        )}
      </>
    );

    return ready ? (
      <Link
        key={st.id}
        to="/stories/$id"
        params={{ id: st.id }}
        className="press text-fg flex items-center gap-4 py-[0.8125rem] no-underline lg:py-[1.125rem]"
      >
        {body}
      </Link>
    ) : (
      <div
        key={st.id}
        className="flex items-center gap-4 py-[0.8125rem] opacity-50 lg:py-[1.125rem]"
      >
        {body}
      </div>
    );
  };

  return (
    <Shell>
      <PageTitle
        title="Stories"
        sub="Short texts made only from words you have learned."
      />
      {/* One list on a phone, two columns on a wide screen. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ListCard className="lg:hidden">{stories.map(row)}</ListCard>
        <ListCard className="hidden lg:flex">
          {stories.slice(0, half).map(row)}
        </ListCard>
        <ListCard className="hidden lg:flex">
          {stories.slice(half).map(row)}
        </ListCard>
      </div>
    </Shell>
  );
}
