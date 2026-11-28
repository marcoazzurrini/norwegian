import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import {
  ExplainRequestSchema,
  FIRST_COURSE,
  mergeMeta,
  ResetRequestSchema,
  stampOf,
  SyncedMetaSchema,
  SyncRequestSchema,
  WireLogSchema,
  WireMemSchema,
} from "./index";
import type { SyncedMetaInput } from "./index";

const card = {
  cardId: "w:hus:noun",
  difficulty: 5,
  dueAt: "2026-11-19T10:00:00.000Z",
  lapses: 0,
  lastReviewAt: "2026-11-18T10:00:00.000Z",
  learningStep: 0,
  reps: 2,
  scheduleStatus: "review",
  scheduledDays: 1,
  stability: 2.5,
  state: 2,
} as const;

const meta = (patch: Partial<SyncedMetaInput> = {}) =>
  v.parse(SyncedMetaSchema, {
    settings: { desiredRetention: 0.9, minutes: 15 },
    ...patch,
  });

describe("memories on the wire", () => {
  test("a memory as the app writes it is accepted", () => {
    const mem = { card, id: "w:hus:noun", introducedAt: 1 };

    expect(v.parse(WireMemSchema, mem)).toEqual(mem);
  });

  test("a date as JSON writes it is accepted", () => {
    const written = {
      card: { ...card, dueAt: new Date(card.dueAt).toJSON() },
      id: "w:hus:noun",
      introducedAt: 1,
    };

    expect(v.is(WireMemSchema, written)).toBe(true);
  });

  test("fields of a newer version are kept", () => {
    const mem = { card: { ...card, future: 1 }, id: "a", introducedAt: 1 };

    expect(v.parse(WireMemSchema, mem).card).toHaveProperty("future", 1);
  });

  test("fields of a newer version beside the card are kept", () => {
    const mem = { card, future: "x", id: "a", introducedAt: 1 };

    expect(v.parse(WireMemSchema, mem)).toEqual(mem);
  });

  test("a memory without a real date is refused", () => {
    const mem = { card: { ...card, dueAt: "soon" }, id: "a", introducedAt: 1 };

    expect(v.is(WireMemSchema, mem)).toBe(false);
  });

  test("a never-reviewed memory is as old as its first learning", () => {
    expect(stampOf({ card: { lastReviewAt: null }, introducedAt: 42 })).toBe(
      42
    );
  });

  test("a reviewed memory is as old as its last review", () => {
    expect(
      stampOf({ card: { lastReviewAt: card.lastReviewAt }, introducedAt: 42 })
    ).toBe(Date.parse(card.lastReviewAt));
  });
});

describe("the sync request", () => {
  test("a first sync from an empty device is accepted", () => {
    const request = {
      epoch: null,
      log: [],
      logSeq: 0,
      memRev: 0,
      memory: [],
      meta: null,
    };

    expect(v.is(SyncRequestSchema, request)).toBe(true);
  });

  test("a negative cursor is refused", () => {
    const request = {
      epoch: 1,
      log: [],
      logSeq: -1,
      memRev: 0,
      memory: [],
      meta: null,
    };

    expect(v.is(SyncRequestSchema, request)).toBe(false);
  });

  test("fields of a newer version survive in a whole request", () => {
    const entry = {
      at: 1,
      carrier: false,
      future: { deep: [1, 2] },
      grade: "good",
      id: "a",
      uid: "u",
    } as const;

    const mem = { card: { ...card, future: 1 }, future: 2, id: "a" };

    const request = {
      epoch: 1,
      log: [entry],
      logSeq: 0,
      memRev: 0,
      memory: [{ ...mem, introducedAt: 1 }],
      meta: null,
    };

    expect(v.parse(SyncRequestSchema, request)).toEqual({
      ...request,
      course: FIRST_COURSE,
    });
    expect(v.parse(WireLogSchema, entry)).toEqual(entry);
  });

  test("a log entry with an unknown grade is refused", () => {
    const entry = { at: 1, carrier: false, grade: "easy", id: "a", uid: "u" };

    const request = {
      epoch: 1,
      log: [entry],
      logSeq: 0,
      memRev: 0,
      memory: [],
      meta: null,
    };

    expect(v.is(SyncRequestSchema, request)).toBe(false);
  });
});

describe("the course of a message", () => {
  const sync = {
    epoch: null,
    log: [],
    logSeq: 0,
    memRev: 0,
    memory: [],
    meta: null,
  };

  test("a sync request names its course", () => {
    expect(v.parse(SyncRequestSchema, { ...sync, course: "de" }).course).toBe(
      "de"
    );
  });

  test("a sync request from before there were courses is for the first course", () => {
    expect(v.parse(SyncRequestSchema, sync).course).toBe("no");
  });

  test("a reset request names its course", () => {
    expect(v.parse(ResetRequestSchema, { course: "de", epoch: 5 })).toEqual({
      course: "de",
      epoch: 5,
    });
  });

  test("a reset request from before there were courses is for the first course", () => {
    expect(v.parse(ResetRequestSchema, { epoch: 5 })).toEqual({
      course: "no",
      epoch: 5,
    });
  });

  test("a course that is not the short name of one is refused", () => {
    for (const course of ["", "NO", "no/de", "9a", null, 1]) {
      expect(v.is(SyncRequestSchema, { ...sync, course })).toBe(false);
      expect(v.is(ResetRequestSchema, { course, epoch: 5 })).toBe(false);
    }
  });
});

describe("settings and counters", () => {
  test("a copy from an older version gets the missing fields", () => {
    expect(meta()).toMatchObject({
      chosenLesson: null,
      days: [],
      prefsAt: 0,
      sentenceSeen: {},
      sounds: {},
      storiesDone: [],
      totalMs: 0,
    });
  });

  test("settings of one device only are kept", () => {
    const parsed = v.parse(SyncedMetaSchema, {
      settings: { desiredRetention: 0.9, minutes: 15, voice: "mia" },
    });

    expect(parsed.settings).toHaveProperty("voice", "mia");
  });

  test("the copy that changed its choices last decides them", () => {
    const older = meta({ chosenLesson: 3, prefsAt: 1 });

    const newer = meta({
      chosenLesson: 7,
      prefsAt: 2,
      settings: { desiredRetention: 0.85, minutes: 25 },
    });

    const merged = mergeMeta(older, newer);

    expect(merged.chosenLesson).toBe(7);
    expect(merged.settings).toMatchObject({
      desiredRetention: 0.85,
      minutes: 25,
    });
  });

  test("counters only grow", () => {
    const a = meta({
      days: ["2026-11-17"],
      sentenceSeen: { s1: 10, s2: 5 },
      sounds: { y: { right: 3, total: 4 } },
      storiesDone: ["st1"],
      totalMs: 100,
    });

    const b = meta({
      days: ["2026-11-18"],
      sentenceSeen: { s1: 4, s3: 9 },
      sounds: { y: { right: 5, total: 8 } },
      storiesDone: ["st2"],
      totalMs: 60,
    });

    expect(mergeMeta(a, b)).toMatchObject({
      days: ["2026-11-17", "2026-11-18"],
      sentenceSeen: { s1: 10, s2: 5, s3: 9 },
      sounds: { y: { right: 5, total: 8 } },
      storiesDone: ["st1", "st2"],
      totalMs: 100,
    });
  });

  test("the order of the two copies does not matter", () => {
    const a = meta({ days: ["a"], prefsAt: 2, totalMs: 5 });
    const b = meta({ chosenLesson: 1, days: ["b"], prefsAt: 1, totalMs: 9 });

    expect(mergeMeta(a, b)).toEqual(mergeMeta(b, a));
  });
});

describe("the explain request", () => {
  const request = {
    answer: "  jeg   har en hus ",
    en: "I have a house.",
    kind: "hint",
    no: "Jeg har et hus.",
    topics: Array.from({ length: 12 }, (_, at) => `topic ${at}`),
  };

  test("white space is tidied and extra topics are dropped", () => {
    const parsed = v.parse(ExplainRequestSchema, request);

    expect(parsed.answer).toBe("jeg har en hus");
    expect(parsed.topics).toHaveLength(8);
  });

  test("the differences are kept, a few at most, and a request without them has none", () => {
    const current = {
      answer: "vi har tre barnet",
      base: "We have three children.",
      course: "no",
      kind: "explain",
      target: "Vi har tre barn.",
      topics: [],
    };

    const differences = Array.from({ length: 12 }, (_, at) => `place ${at}`);

    expect(v.parse(ExplainRequestSchema, current).differences).toEqual([]);
    expect(
      v.parse(ExplainRequestSchema, { ...current, differences }).differences
    ).toEqual(differences.slice(0, 8));
  });

  test("an empty answer is refused", () => {
    expect(v.is(ExplainRequestSchema, { ...request, answer: "   " })).toBe(
      false
    );
  });

  test("an unknown kind is refused", () => {
    expect(v.is(ExplainRequestSchema, { ...request, kind: "essay" })).toBe(
      false
    );
  });
});
