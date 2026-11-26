// The global names of IndexedDB, which the `idb` library looks up. Each test still gets its own empty database.
import "fake-indexeddb/auto";
import { expect, test } from "bun:test";

import { JournalRequestSchema } from "@norsk/protocol";
import type { JournalRequest } from "@norsk/protocol";
import { IDBFactory } from "fake-indexeddb";
import * as v from "valibot";

import { createJournal, MAX_KEPT } from "./index";
import type { Fetch } from "./index";

/** A journal on an empty device, and a server that answers with `status`. */
const setup = (status: () => number = () => 200) => {
  const sent: JournalRequest[] = [];
  let ids = 0;
  let clock = 1000;

  const fetch: Fetch = async (_path, init) => {
    const code = status();

    if (code === 0) {
      throw new TypeError("Failed to fetch");
    }

    if (code === 200) {
      const body = await new Response(init.body).text();

      sent.push(v.parse(JournalRequestSchema, JSON.parse(body)));
    }

    return new Response("{}", { status: code });
  };

  const journal = createJournal({
    fetch,
    indexedDB: new IDBFactory(),
    newId: () => {
      ids += 1;

      return `e-${ids}`;
    },
    now: () => {
      clock += 1;

      return clock;
    },
  });

  return { journal, sent };
};

test("events are sent in the order they happened, with their time and session", async () => {
  const { journal, sent } = setup();

  journal.record("task.taught", { ids: ["w-0"] }, "s-1");
  journal.record("task.taught", { ids: ["w-1"] }, "s-1");
  journal.record("task.event", { event: "typed" });
  await journal.flush();

  expect(sent).toEqual([
    {
      events: [
        {
          at: 1001,
          data: { ids: ["w-0"] },
          kind: "task.taught",
          session: "s-1",
          uid: "e-1",
        },
        {
          at: 1002,
          data: { ids: ["w-1"] },
          kind: "task.taught",
          session: "s-1",
          uid: "e-2",
        },
        {
          at: 1003,
          data: { event: "typed" },
          kind: "task.event",
          session: null,
          uid: "e-3",
        },
      ],
    },
  ]);
});

test("events the server stored are not sent again", async () => {
  const { journal, sent } = setup();

  journal.record("task.taught", { ids: ["a"] });
  await journal.flush();
  journal.record("task.taught", { ids: ["b"] });
  await journal.flush();

  expect(sent.map((page) => page.events.map((event) => event.data))).toEqual([
    [{ ids: ["a"] }],
    [{ ids: ["b"] }],
  ]);
  expect(await journal.waiting()).toBe(0);
});

test("without a connection the events wait, and go with the next flush", async () => {
  let online = false;
  const { journal, sent } = setup(() => (online ? 200 : 0));

  journal.record("task.taught", { ids: ["a"] });
  await journal.flush();

  expect(await journal.waiting()).toBe(1);

  online = true;
  journal.record("task.taught", { ids: ["b"] });
  await journal.flush();

  expect(sent[0]?.events.map((event) => event.data)).toEqual([
    { ids: ["a"] },
    { ids: ["b"] },
  ]);
  expect(await journal.waiting()).toBe(0);
});

test("a refusal by the server, such as not being signed in, keeps the events", async () => {
  const { journal } = setup(() => 401);

  journal.record("task.taught", { ids: ["a"] });
  await journal.flush();

  expect(await journal.waiting()).toBe(1);
});

test("more events than one message carries are sent in pages", async () => {
  const { journal, sent } = setup();

  for (let index = 0; index < 1200; index += 1) {
    journal.record("task.event", { event: index });
  }

  await journal.flush();

  expect(sent.map((page) => page.events.length)).toEqual([500, 500, 200]);
  expect(await journal.waiting()).toBe(0);
});

test("a device that cannot send keeps only the newest events", async () => {
  const { journal, sent } = setup(() => 200);

  for (let index = 0; index < MAX_KEPT + 50; index += 1) {
    journal.record("task.event", { event: index });
  }

  expect(await journal.waiting()).toBe(MAX_KEPT);

  await journal.flush();

  expect(sent[0]?.events[0]?.uid).toBe("e-51");
}, 60_000);
