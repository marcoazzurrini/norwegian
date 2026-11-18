import { expect, test } from "bun:test";

import { item } from "@norsk/content";

import { hasArticle, itemName, shuffled, soundOf } from "./items";

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

test("an item is named by its words and meaning, a pattern by its title", () => {
  expect(itemName("c:hei")).toBe("hei (hi)");
  expect(itemName("c:jeg-heter")).toBe("jeg heter … (my name is ___)");
  expect(itemName("p:present")).toBe("Verbs now");
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
