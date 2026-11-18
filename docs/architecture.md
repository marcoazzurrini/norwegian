# Architecture

The code is a Bun workspace. Two apps are thin; the logic lives in packages. Each package hides one hard problem behind a small interface, and only what its `package.json` lists under `exports` can be imported.

```
apps/
  web/        The app: routes, screens, and the wiring of the packages
  api/        The Cloudflare Worker: HTTP routes; it also serves the built web app
packages/
  content/    Curriculum data, its types and lookups, and the scripts that build it
  engine/     Scheduling, grading, session planning, and one state machine per kind of task
  protocol/   A Valibot schema for every message between the app and the server
  learner/    The learner's data on a device, and its sync with the server
  db/         The D1 database, through Drizzle
  auth/       Sign-in: the server handler, the session check, the browser client
  speech/     Playing Norwegian audio
  ui/         Design tokens, components and patterns (StyleX, Base UI)
```

## Which package may import which

| Package | May import |
| --- | --- |
| `content` | nothing |
| `protocol` | nothing |
| `ui` | nothing |
| `engine` | `content` |
| `speech` | `content` |
| `db` | `protocol` |
| `auth` | nothing |
| `learner` | `engine`, `protocol` |
| `api` | `db`, `auth`, `protocol` |
| `web` | `ui`, `engine`, `learner`, `content`, `speech`, `auth`, `protocol` |

## What each package hides

- **`content`**: the shape of `curriculum.json` and the indexes over it. The build script checks the curriculum against a Valibot schema before writing it, so the app trusts the file without checking it again.
- **`engine`**: FSRS, the rules for reviews inside a sentence, how a typed answer is compared, how a session is planned. Everything is pure: time and randomness are passed in. A task is a state machine: `init(input)` and `step(state, event, now)` return the next state and a list of effects as plain data (`teach`, `review`, `speak`, `done`, and so on).
- **`protocol`**: nothing clever. It is the one definition of every request and response, so the browser and the Worker cannot disagree. The merge rule for settings and the rule for which copy of a memory is newer live here because both sides apply them.
- **`learner`**: IndexedDB, the order of writes, the sync loop, retries, data generations ("Start over"), and backup files. The review log is the truth and a memory is computed from it: the log entry is written first, and on start any entry newer than its memory is applied again. The app gives it `indexedDB`, `fetch`, a clock, and a small account object.
- **`db`**: SQL, the revision and generation counters, batching, and paging of the log. A test compares the Drizzle schema with the SQL migrations, so the two cannot drift.
- **`auth`**: Better Auth, Google, the allow-list of email addresses, the cookie and the cross-origin check. A route asks `requireUser(request)` and gets a user or a finished error response.
- **`speech`**: the recorded files and their hashed names, the browser voice as a fallback, playback speed, and stopping one clip when the next starts.
- **`ui`**: StyleX, Base UI, the tokens, and the responsive rules. Components take data and callbacks only; they never import the learner, the engine or the router.

## How a screen works

A screen reads from the learner through a hook that covers one slice of the data, so a review does not redraw a screen that only shows settings. A task screen runs a state machine from `engine`. The hook `apps/web/src/components/tasks/use-task.ts` passes events to the machine and carries out the effects it returns, by calling the learner and the speech package. The component only draws.

## Decisions and their reasons

- **No TanStack DB.** It was tried for the learner's data. With 100,000 log entries it added about two seconds to every start, it cannot write two stores in one transaction, and it needed a data migration. `idb` on the existing layout starts in about 12 ms and needs no migration. State that is not saved (sync status) lives in a TanStack Store.
- **Better Auth keeps its own D1 access.** Moving it to Drizzle would have risked the sessions of signed-in devices for no gain, so `auth` does not import `db`.
- **Packages export TypeScript source.** There is no build step per package. Vite, Wrangler and Bun compile the source of whatever they import.
- **StyleX is compiled by the app.** `@norsk/ui/vite` is the one place that configures it, for the web app and for the component tests alike.

## Tooling

| Tool | Use |
| --- | --- |
| Bun workspaces | Installing, running scripts, and `bun test` for pure packages |
| TypeScript 7 | One strict configuration, `tsconfig.base.json` |
| oxlint with Ultracite | Linting, including the anti-slop rules and type-aware rules |
| oxfmt | Formatting |
| lefthook | Format and lint before a commit; types and tests before a push |
| Vitest with the Cloudflare plugin | Tests of `db`, `auth` and `api` in the real Worker runtime |
| Vitest browser mode | Tests of `ui` in a real browser |
| Playwright | End-to-end tests of the whole app, at a desktop and a phone size |

No lint rule is turned off in the configuration. A rule is silenced on a single line only where it is wrong for that line, with the reason beside it.

## Checking a change to the look

`apps/web/screens/` holds a script that takes a picture of every screen and state at both sizes, and one that compares two sets of pictures pixel by pixel. Take a set before a change to the UI and another after it.
