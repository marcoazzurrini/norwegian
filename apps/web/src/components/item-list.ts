// The Items screen as data: the items of each unit that match a search, and what is said about one memory.
import { item, lessons, units } from "@norsk/content";
import type { Item, Unit } from "@norsk/content";
import type { Mem } from "@norsk/engine";

export interface ItemGroup {
  unit: Unit;
  list: Item[];
}

const matches = (one: Item, query: string): boolean =>
  one.text.toLowerCase().includes(query) ||
  one.gloss.toLowerCase().includes(query);

/** The items of every unit, in the order they are taught, that match the search. Units with none are left out. */
export const itemGroups = (search: string): ItemGroup[] => {
  const query = search.trim().toLowerCase();

  return units
    .map((unit) => ({
      list: unit.lessons
        .flatMap((index) => lessons[index]?.items ?? [])
        .map((id) => item(id))
        .filter((one) => query === "" || matches(one, query)),
      unit,
    }))
    .filter((group) => group.list.length > 0);
};

/** A list cut in two after the chosen item, so its details can open right under it. */
export interface SplitList {
  /** Up to and including the chosen item. */
  before: Item[];
  chosen: Item;
  after: Item[];
}

export const splitAt = (list: Item[], id: string | null): SplitList | null => {
  const at = list.findIndex((one) => one.id === id);
  const chosen = list[at];

  return chosen === undefined
    ? null
    : { after: list.slice(at + 1), before: list.slice(0, at + 1), chosen };
};

export interface MemoryNote {
  /** How long the memory lasts, such as "12 days". */
  lasts: string;
  /** When the item comes back: "now", or a date such as "27 Mar". */
  next: string;
}

export const memoryNote = (mem: Mem, now: number): MemoryNote => {
  const due = new Date(mem.card.dueAt);

  return {
    lasts:
      mem.card.stability < 1
        ? "less than a day"
        : `${Math.round(mem.card.stability)} days`,
    next:
      due.getTime() <= now
        ? "now"
        : due.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
};
