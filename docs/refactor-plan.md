# Refactor plan

The app was built quickly as a prototype. This plan turns it into a codebase that is easy to change safely. The app must behave the same after every step, and every step must be shippable, because a push to `main` deploys.

## Goals

1. Deep modules: each package hides a hard problem behind a small interface that does not leak how it works.
2. Logic apart from views: screens draw state and send events. They do not decide anything.
3. Data checked at every boundary: network, IndexedDB, backup files, the language model.
4. Strict tooling that runs before a commit and again in CI.
5. Integration tests that exercise each package through its public interface only.

## Not goals

- No new features and no design changes. The penna designs stay the source of truth for the look.
- No Turborepo, no TanStack Query, no server rendering.

## Target layout

```
apps/
  web/        TanStack Start single-page app: routes, screens, wiring
  api/        Cloudflare Worker: HTTP routes, serves the built web app
packages/
  content/    Curriculum data, its types, lookups, and the build scripts
  engine/     Scheduling, grading, session planning, task state machines
  protocol/   Valibot schemas for everything that crosses the network
  learner/    The learner's data on this device, and sync
  db/         D1 through Drizzle: schema, migrations, queries
  auth/       Sign-in: server handler, session check, browser client
  speech/     Playing Norwegian audio
  ui/         Design tokens, components and patterns (StyleX, Base UI)
```

### Which package may import which

| Package    | May import                                              |
| ---------- | ------------------------------------------------------- |
| `content`  | nothing                                                 |
| `protocol` | nothing                                                 |
| `ui`       | nothing                                                 |
| `engine`   | `content`                                               |
| `speech`   | `content`                                               |
| `db`       | `protocol`                                              |
| `auth`     | `db`                                                    |
| `learner`  | `engine`, `protocol`                                    |
| `api`      | `db`, `auth`, `protocol`                                |
| `web`      | `ui`, `engine`, `learner`, `content`, `speech`, `auth`  |

A lint rule enforces this table. Each package exposes only what its `exports` field in `package.json` lists; deep imports into another package are an error.

## The packages

Each interface below is a first sketch. The rule for all of them: a caller should not be able to tell how the package works inside.

### `packages/content`

Hides: the shape of `curriculum.json`, the indexes built over it, and the scripts that make it from the text files in `content/`.

Interface: the types (`Item`, `Lesson`, `Sentence`, `Story`, `SoundPair`) and lookups (`item(id)`, `lessonOf(id)`, `sentencesWith(id)`, `storyById(id)`, `unlockedBy(index)`).

The scripts `build-content.ts`, `build-audio.ts` and `rank-lemmas.ts` move here. `curriculum.json` is validated with a Valibot schema when it is built, not when the app starts.

### `packages/engine`

Hides: FSRS, the rules for carrier credit and same-day reviews, how a typed answer is compared, how a session is planned, and the steps inside each kind of task.

Interface:

- Memory: `createScheduler`, `introduce`, `review`, `retrievability`, `isDue`, `isStable`.
- Selection: `dueItems`, `pickReview`, `nextLesson`, `nextNewItems`, `lessonState`, `itemState`, `nextStory`.
- Grading: `gradeSentence`, `gradeCard`.
- Session: `Session`.
- Task machines, new: one pure reducer per task kind (`sentenceTask`, `cardTask`, `introTask`, `patternTask`, `soundTask`, `storyTask`). Each takes a state and an event and returns the next state plus the results to record. This is the logic that sits inside the task components today.

Everything is pure. Time and randomness are passed in, so tests are exact.

### `packages/protocol`

Hides: nothing clever. It is the single definition of every request and response: sync, reset, explain, and the audio upload. Types are derived from the Valibot schemas, so the browser and the Worker cannot disagree. `mergeMeta` and `stampOf` live here because both sides use them.

### `packages/learner`

Hides: IndexedDB, TanStack DB collections, the order of writes, the sync loop, retries, epochs, "Start over", and backup files.

Interface:

- `createLearner({ indexedDB, fetch, now })` returns the learner.
- Commands: `teach(ids)`, `applyReviews(inputs)`, `addStudyTime(ms)`, `updateSettings(patch)`, `chooseLesson(index)`, `markStoryDone(id)`, `recordSound(group, right)`, `exportBackup()`, `restoreBackup(json)`, `startOver()`.
- Reads: `memory()`, `settings()`, `progress()`, `syncStatus()`.
- A React entry point, `@norsk/learner/react`, with hooks for the same reads. Each hook subscribes to one slice, so a review no longer re-renders every screen.

Saved data lives in TanStack DB collections on IndexedDB. Sync status is not saved, so it lives in a TanStack Store.

### `packages/db`

Hides: SQL, Drizzle, the `rev` and `epoch` counters, batching, and paging of the log.

Interface: `createDb(d1)` returns `{ exchange(request), reset(epoch) }` plus the tables that `auth` needs. `exchange` takes and returns the sync types from `protocol`.

The Drizzle schema must match the existing tables exactly. The first check is that `drizzle-kit` generates an empty migration against `migrations/0001_init.sql`. The bulk upsert that uses `json_each` stays as raw SQL inside this package.

### `packages/auth`

Hides: Better Auth, Google, the allow-list of email addresses, the cookie, and the cross-origin check.

Interface:

- Server: `createAuth(env)` returns `{ handler(request), requireUser(request) }`. `requireUser` returns a user or a ready-made error response. The route code never sees a session object.
- Browser, `@norsk/auth/client`: `signIn()`, `signOut()`, `currentUser()`.

### `packages/speech`

Hides: the recorded files, their hashed names, the browser voice as a fallback, playback speed, and stopping one clip when the next starts.

Interface: `speak(text, options)`, `stopSpeaking()`, `useVoices()`, and `audioKey(text)` for the build script.

### `packages/ui`

Hides: StyleX, Base UI, the tokens, and the responsive rules.

Three layers, as in penna:

- Tokens: colours, type sizes, radii, motion, as StyleX variables. Type sizes stay in rem so the text-size setting keeps working.
- Components: `Button`, `IconButton`, `AudioButton`, `Key`, `Blob`, `Tag`, `Chip`, `Card`, `ListCard`, `Progress`, `Segmented`, `PageTitle`, `Label`, `Display`, `AnswerInput`.
- Patterns: `Shell`, `Focus`, and the exchange parts (`Stamp`, `Ask`, `Mine`, `Remark`, `Answer`, `AiNote`, `Choices`).

Base UI supplies behaviour where it is easy to get wrong: the radio group behind `Segmented`, `Progress`, and a dialog for confirmations. Components take data and callbacks only. They never import `learner`, `engine` or the router.

### `apps/api`

A Hono app. Each route validates its input with a `protocol` schema, calls one package, and returns. It also gets a rate limit on `/api/explain`, structured logs, and one error handler. The prompt for the language model stays here.

### `apps/web`

Routes and screens. A screen reads from `learner` hooks, runs a task machine from `engine` with `useReducer`, and draws with `ui`. It also gets an error boundary.

## Tooling

- **Workspaces**: Bun workspaces with a catalog, so each dependency has one version. Scripts run with `bun run --filter`.
- **TypeScript 7.0.2**: one base config, project references, `tsc -b`. Extra strict flags: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **Lint and format**: oxlint with the Ultracite preset, including its anti-slop rules, and oxfmt. A rule may be turned off only if it is purely about style, and the config says why in a comment.
- **Git hooks**: lefthook. Before a commit: format and lint the staged files. Before a push: type check and the Bun tests.
- **CI**: pinned Bun version. Jobs: lint, type check, Bun tests, Worker tests, build, end-to-end tests, deploy. Work goes through pull requests.

## Tests

| What                                   | Runner                                   | Why this runner                                   |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| `content`, `engine`, `protocol`        | `bun test`                               | Pure code, fastest runner                         |
| `learner`                              | `bun test` with `fake-indexeddb`         | Needs IndexedDB but no browser                    |
| `db`, `auth`, `api`                    | Vitest with Cloudflare's Workers pool    | Runs in the real Worker runtime with a real D1    |
| `ui`                                   | Vitest browser mode                      | StyleX needs the Vite plugin and a real browser   |
| Whole app                              | Playwright                               | Real browser, both screen sizes                   |

Tests go through the public interface of a package. Examples of what they must cover:

- `engine`: a full simulated month of study, so scheduling, selection and sessions are tested together.
- `learner` with `api`: two devices study offline, then sync, and end with the same data. A "Start over" on one device clears the other.
- `db`: an older review never replaces a newer one. A stale epoch is refused.
- `auth`: an address outside the allow-list cannot sign in. A request from another origin is refused.
- Playwright: a first session from an empty account, a review session, study offline then sync.

## Steps

Each step is one pull request, or a few small ones. The app works after each.

### Step 0: safety net

Add a few Playwright tests against the app as it is now. They prove that later steps change nothing the learner can see. Export a backup of the real data.

Done when: the tests pass against the current `main`.

### Step 1: workspace and tooling

Move the code into `apps/web` and `apps/api` with no changes in behaviour. Add workspaces, TypeScript 7, oxlint with Ultracite, oxfmt, lefthook, and the new CI. Fix every lint finding.

Done when: CI is green with no disabled rule except documented style rules, and the deployed app works.

### Step 2: `content`, `engine`, `protocol`

Extract the three packages. Write the Valibot schemas. Move the logic out of the six task components into task machines, with tests.

Done when: no task component holds a decision, and the simulated-month test passes.

### Step 3: `db`, `auth`, `api`

Add Drizzle with a schema that matches production. Wrap Better Auth. Rewrite the Worker on Hono with validated routes, a rate limit and logs. Add the Worker tests.

Done when: `drizzle-kit` reports no schema difference against production, and the two-device test passes against a real D1.

### Step 4: `learner`

First a short trial of TanStack DB with pass or fail criteria (see Risks). Then build the package, migrate the data on the device, and move sync status to TanStack Store.

Done when: existing data survives the upgrade in a test that starts from a copy of the current IndexedDB layout.

### Step 5: `speech`

Extract the package. Small step.

### Step 6: `ui`

Set up StyleX and Base UI. Rebuild tokens, then components, then patterns, then one screen at a time. Tailwind and StyleX live side by side until the last screen is moved; then Tailwind is removed.

Done when: every screen matches its penna design at 2560×1440 and 393×852, and Tailwind is gone.

### Step 7: finish

Complete the Playwright suite, update `README.md`, and write a short `docs/architecture.md` that replaces this plan.

## Risks

1. **TanStack DB is a release candidate (1.0.0-rc).** Its API may still change. The `learner` interface hides it, so a change stays inside one package.
2. **TanStack DB does not write two collections in one IndexedDB transaction.** Today a review saves the memory and its log entry together. The trial in step 4 must show that a crash between the two writes cannot lose or duplicate a review. If it cannot, `learner` keeps `idb` for storage and uses TanStack Store for state. The interface is the same either way.
3. **Data on the device must be migrated.** TanStack DB needs object stores with out-of-line keys; the current `memory` store uses an inline key and `log` uses auto-increment. The upgrade copies rows into new stores and keeps the old ones for one release. The server also holds a full copy.
4. **The Drizzle schema could drift from production.** The empty-migration check in step 3 guards against this. No migration runs against production in this refactor.
5. **Tool compatibility.** To verify in step 1: every tool works with TypeScript 7. To verify at the start of step 6: the StyleX plugin works with Vite 8 and TanStack Start.
6. **Strict lint rules on prototype code** will produce many findings. Step 1 may need to be split into "move files" and "fix findings".

## Open questions

1. Should the Worker be its own app (`apps/api`), as planned here, or stay inside `apps/web`? A separate app is cleaner. It is still one deployment.
2. If the TanStack DB trial fails on risk 2, is the fallback (`idb` plus TanStack Store) acceptable?
