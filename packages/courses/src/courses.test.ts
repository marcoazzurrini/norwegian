// The list of courses and the loader must agree: every course listed can be loaded, under its own id.
import { expect, test } from "bun:test";

import { courseMeta, courses, firstCourse } from "./index";
import { loadCourse } from "./load";

test("every listed course loads, and is the course it says it is", async () => {
  for (const meta of courses) {
    // oxlint-disable-next-line no-await-in-loop -- The courses are few, and one at a time gives a clear failure.
    const course = await loadCourse(meta.id);

    expect(course.meta).toBe(meta);
  }
});

test("course ids are unique and fit an address", () => {
  const ids = courses.map((course) => course.id);

  expect(new Set(ids).size).toBe(ids.length);

  for (const id of ids) {
    expect(id).toMatch(/^[a-z][a-z0-9-]{0,19}$/u);
  }
});

test("a course is found by its id", () => {
  expect(courseMeta(firstCourse().id)).toBe(firstCourse());
  expect(courseMeta("nowhere")).toBeUndefined();
});

test("an unknown course does not load", async () => {
  const loaded = await loadCourse("nowhere").catch(() => null);

  expect(loaded).toBeNull();
});
