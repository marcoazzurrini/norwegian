import { expect, test } from "bun:test";

import { course } from "@norsk/norwegian";

import {
  differenceFacts,
  hasArticle,
  itemFacts,
  itemName,
  shuffled,
  soundOf,
} from "./items";

const { item } = course;

/** The shuffle of the first version of the app, which this one must match draw for draw. */
const reference = <Value>(list: Value[], random: () => number): Value[] => {
  const out = [...list];

  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];

    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }

  return out;
};

/** A repeatable stream of numbers from 0 up to 1. */
const stream = (seed: number) => {
  let state = seed;

  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;

    return state / 2_147_483_648;
  };
};

test("the facts of an item are its name with its rule, or with its article and forms", () => {
  expect(itemFacts(course, "c:hei")).toBe("hei (hi)");
  expect(itemFacts(course, "w:på:prep")).toBe("på (on)");
  expect(itemFacts(course, "p:present")).toBe(
    "Verbs now: A verb has one form for everyone: jeg er, du er, vi er. Most verbs end in -r in the present: snakker, kommer, heter."
  );
  expect(itemFacts(course, "w:rom:noun")).toBe(
    'rom (room): et word; "a" form “rom”, "the" form “rommet”, "several" form “rom”, "the several" form “rommene”'
  );
});

test("a difference says what kind of wrong word was typed", () => {
  const room = { expected: "rom", sameWord: null };

  expect(differenceFacts(course, { ...room, typed: ["rømet"] })).toBe(
    "Expected “rom”, typed “rømet”: not a form of the expected word, so a misspelling or a different word."
  );
  expect(
    differenceFacts(course, {
      expected: "rom",
      sameWord: "w:rom:noun",
      typed: ["rommet"],
    })
  ).toBe(
    'Expected “rom”, typed “rommet”: the right word in the wrong form, its "the" form.'
  );
  // A word such as "vår" has no table of forms, so its wrong form has no name.
  expect(
    differenceFacts(course, {
      expected: "vårt",
      sameWord: "w:vår:det",
      typed: ["vår"],
    })
  ).toBe("Expected “vårt”, typed “vår”: the right word in the wrong form.");
  expect(
    differenceFacts(course, {
      expected: "rom",
      sameWord: "w:rom:noun",
      typed: ["romer"],
    })
  ).toBe(
    "Expected “rom”, typed “romer”: the right word in the wrong form, a form that this word does not have."
  );
  expect(differenceFacts(course, { ...room, typed: [] })).toBe(
    "“rom” is missing."
  );
  expect(
    differenceFacts(course, { expected: null, sameWord: null, typed: ["nå"] })
  ).toBe("“nå” is a word too many.");
});

test("an item is named by its words and meaning, a pattern by its title", () => {
  expect(itemName(course, "c:hei")).toBe("hei (hi)");
  expect(itemName(course, "c:jeg-heter")).toBe("jeg heter … (my name is ___)");
  expect(itemName(course, "p:present")).toBe("Verbs now");
});

test("only a noun shown with its article has one", () => {
  expect(hasArticle(item("w:hus:noun"))).toBe(true);
  expect(hasArticle(item("w:penger:noun"))).toBe(false);
  expect(hasArticle(item("c:ha-det-bra"))).toBe(false);
});

test("the sound is shown without the stress mark", () => {
  expect(soundOf("ˈmɑn")).toBe("mɑn");
});

test("a shuffle keeps every value and takes the same draws as before", () => {
  const list = ["a", "b", "c", "d", "e", "f"];

  for (const seed of [1, 2, 3, 4, 5]) {
    expect(shuffled(list, stream(seed))).toEqual(reference(list, stream(seed)));
  }

  expect(shuffled(list, () => 0.5).toSorted()).toEqual(list);
  expect(shuffled([], () => 0.5)).toEqual([]);
  expect(list).toEqual(["a", "b", "c", "d", "e", "f"]);
});
