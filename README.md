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

To try sync on your own machine, put `SYNC_KEY=anything` in `.dev.vars`, then run `bun run build`, `bunx wrangler d1 migrations apply norsk --local` and `bunx wrangler dev`. `bun run dev` serves the app without the sync server.

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

## Language data

`bun run content` needs three downloads in `data/raw/`. They are only needed to rebuild the curriculum; the built `curriculum.json` is in the repository.

| Folder | Source | Licence |
|---|---|---|
| `freq/no_50k.txt` | [FrequencyWords](https://github.com/hermitdave/FrequencyWords), `content/2018/no/no_50k.txt` | CC BY-SA 4.0 |
| `ordbank/` | [Norsk Ordbank, Bokmål 2005](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-5/), National Library of Norway | CC BY 4.0 |
| `uttale/nb_uttale_leksika/e_written_pronunciation_lexicon.csv` | [NB Uttale](https://www.nb.no/sprakbanken/ressurskatalog/oai-nb-no-sbr-79/), National Library of Norway | CC0 |

## Your progress and sync

Progress is stored in the browser on each device (IndexedDB), so the app works offline. To share progress between devices, open Settings on each one and enter the sync key. On an iPhone, enter it in the installed app, not in Safari: the two keep separate data.

The sync key is the Worker secret `SYNC_KEY`. A copy is in `.sync-key`, which is not in git. To change it, run `bunx wrangler secret put SYNC_KEY` and enter the new key on every device.

How sync decides:

- **Items:** the copy that was reviewed last wins.
- **Review log:** entries from all devices are kept.
- **Session length, recall target, chosen lesson:** the device that changed them last wins.
- **Voice, speaking speed, text size:** stay separate on each device.
- **Start over** and **Restore** apply to every linked device.

Settings also has "Save backup", which writes all progress to a file.
