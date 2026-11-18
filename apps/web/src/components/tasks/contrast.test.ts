import { expect, test } from "bun:test";

import { items } from "@norsk/content";

import { contrast, spokenForm } from "./contrast";

/** The first version of this function, kept to check every example of the course against. */
const reference = (no: string) => {
  const [a = "", b] = no.split(">").map((s) => s.trim());

  if (b === undefined || b === "") {
    return { added: "", from: null, kept: a };
  }

  const base = (a.split(" ").pop() ?? "").replaceAll(/[!?.]/gu, "");
  const target = b.split(" ").pop() ?? "";
  const prefix = b.slice(0, b.length - target.length);

  if (target.startsWith(base) && target.length > base.length) {
    return { added: target.slice(base.length), from: a, kept: prefix + base };
  }

  let i = 0;

  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }

  return i > 2 && i < b.length
    ? { added: b.slice(i), from: a, kept: b.slice(0, i) }
    : { added: "", from: a, kept: b };
};

test("an example with one form has nothing to contrast", () => {
  expect(contrast("jeg er")).toEqual({ added: "", from: null, kept: "jeg er" });
  expect(spokenForm("jeg er")).toBe("jeg er");
});

test("an ending added to the last word is what is new", () => {
  expect(contrast("en bil > bilen")).toEqual({
    added: "en",
    from: "en bil",
    kept: "bil",
  });
  expect(contrast("en bil > to biler")).toEqual({
    added: "er",
    from: "en bil",
    kept: "to bil",
  });
  expect(spokenForm("en bil > bilen")).toBe("bilen");
});

test("otherwise what follows the shared start is new", () => {
  expect(contrast("jeg snakker > jeg snakket")).toEqual({
    added: "t",
    from: "jeg snakker",
    kept: "jeg snakke",
  });
});

test("forms with nothing in common are shown whole", () => {
  expect(contrast("å komme > kom!")).toEqual({
    added: "",
    from: "å komme",
    kept: "kom!",
  });
});

test("every example of the course is split as before", () => {
  const examples = Object.values(items).flatMap(
    (one) => one.examples?.map((example) => example.no) ?? []
  );

  expect(examples.length).toBeGreaterThan(40);

  for (const example of examples) {
    expect(contrast(example)).toEqual(reference(example));
  }
});
