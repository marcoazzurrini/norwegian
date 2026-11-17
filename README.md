# Norsk

A personal app for learning Norwegian (Bokmål) from zero. It teaches words, phrases and grammar patterns, then reviews them inside typed sentences so that one review covers several items.

The reasoning behind the design is in [docs/spec.md](docs/spec.md).

## Run it

```bash
bun install
bun run dev        # http://localhost:3000
```

Other commands:

| Command | What it does |
|---|---|
| `bun run build` | Builds static files into `dist/client` |
| `bun run preview` | Serves the built app |
| `bun run test` | Runs the learning-engine tests |
| `bun run typecheck` | Checks types |
| `bun run content` | Rebuilds the curriculum from `content/` |

## Deploy

The app runs at https://norwegian.marcoazzurrini.com as a Cloudflare Worker. Static files come from `dist/client`; the Worker in `worker/` answers `/api/*` and stores progress in a D1 database.

Every push to `main` runs the checks in `.github/workflows/ci.yml`, then applies new database migrations and publishes. The workflow uses the GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

To publish by hand instead:

```bash
bun run deploy                                    # build and publish
bunx wrangler d1 migrations apply norsk --remote  # only after adding a file to migrations/
```

To try the server on your own machine, put `SYNC_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=http://localhost:8787`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `ALLOWED_EMAILS` in `.dev.vars`, then run `bun run build`, `bunx wrangler d1 migrations apply norsk --local` and `bunx wrangler dev`. `bun run dev` serves the app without the sync server.

## Install it as an app

Open https://norwegian.marcoazzurrini.com in a browser:

- **Desktop (Chrome, Edge):** use the install button in the address bar.
- **iPhone:** Share, then "Add to Home Screen".
- **Android:** browser menu, then "Install app".

After the first visit it works offline.

## Where things are

| Path | Contents |
|---|---|
| `content/` | The curriculum as plain text: units, lessons, sentences, stories, sound pairs. Format in `content/README.md`. |
| `scripts/build-content.ts` | Checks the curriculum and builds `src/content/curriculum.json`. |
| `src/engine/` | Memory model, grading, task choice and session flow. No UI. |
| `src/components/tasks/` | One component per kind of task. |
| `src/routes/` | Pages. |
| `src/sync/` | Sync rules shared by the app and the server. |
| `worker/`, `migrations/` | The sync server and its database tables. |
| `.penna/` | The screen designs. |
| `data/raw/` | Downloaded language data. Not in git. See below. |

## Recorded audio

The app plays recorded Norwegian when it exists and falls back to the browser's voice when it does not. Recordings are made with ElevenLabs, stored in the R2 bucket `norsk-audio`, and served at `/audio/<voice>/<name>.mp3`. A file's name is a hash of its text, so the app finds a recording without a database.

```bash
bun run audio voices                  # list Norwegian voices in the ElevenLabs library
bun run audio sample <voice-id>...    # record a few texts per voice into data/audio/samples
bun run audio add <slug> <voice-id>   # add a voice to content/audio.json
bun run audio build --dry             # count what would be recorded
bun run audio build                   # record what is missing, upload it, switch the app over
```

This needs `ELEVENLABS_API_KEY` in `.env` and the sync key in `.sync-key`. Recordings are kept in `data/audio`, so a text is never paid for twice. After `build`, commit `content/audio.json` and `src/content/audio.json` and push. Run `build` again after the curriculum changes.

With several voices, a text keeps one voice for a day and changes voice over time.

## Language data

`bun run content` needs three downloads in `data/raw/`. They are only needed to rebuild the curriculum; the built `curriculum.json` is in the repository.

| Folder | Source | Licence |
|---|---|---|
| `freq/no_50k.txt` | [FrequencyWords](https://github.com/hermitdave/FrequencyWords), `content/2018/no/no_50k.txt` | CC BY-SA 4.0 |
| `ordbank/` | [Norsk Ordbank, Bokmål 2005](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-5/), National Library of Norway | CC BY 4.0 |
| `uttale/nb_uttale_leksika/e_written_pronunciation_lexicon.csv` | [NB Uttale](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-79/), National Library of Norway | CC0 |

## Your progress and sync

Progress is stored in the browser on each device (IndexedDB), so the app works offline. To share progress between devices, open Settings on each one and press **Sign in with Google**. On an iPhone, sign in inside the installed app, not in Safari: the two keep separate data. A device stays signed in as long as it is used at least once every six months.

Sign-in is handled by [Better Auth](https://better-auth.com) in the Worker (`worker/auth.ts`). Only the addresses in the Worker secret `ALLOWED_EMAILS` (separated by commas) can sign in. The other secrets are `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; set each with `bunx wrangler secret put NAME`. The Google OAuth client lives in the Google Cloud project "Norsk" and must list `https://norwegian.marcoazzurrini.com/api/auth/callback/google` as a redirect URI.

`SYNC_KEY` is now used only by the audio build script. A copy is in `.sync-key`, which is not in git.

How sync decides:

- **Items:** the copy that was reviewed last wins.
- **Review log:** entries from all devices are kept.
- **Session length, recall target, chosen lesson:** the device that changed them last wins.
- **Voice, speaking speed, text size:** stay separate on each device.
- **Start over** and **Restore** apply to every linked device.

Settings also has "Save backup", which writes all progress to a file.
