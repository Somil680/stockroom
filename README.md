# Stockroom — Shop Stock Counter

A mobile-friendly shared counter for a small paint and hardware shop. Includes 731 product names from the supplied stock report. Every product starts at zero until its quantity is first saved. The report's existing stock figures are not imported.

## What it does

- Product search, product catalogue and counting views.
- Increment/decrement by one or enter a whole quantity directly (0–999999 pieces).
- Auto-save after a 350 ms pause, with saving, retry and conflict states.
- Shared stock in Cloudflare D1. Visible pages refresh every 10 seconds and when returning to the app.
- Local browser snapshot of confirmed cloud data, with the last successful local-backup time.
- Downloadable, validated JSON backups containing all product names and quantities.
- Restore preview showing every changed quantity, explicit confirmation and a pre-restore backup download.
- Atomic restore: if any cloud version changed after preview, no quantities are restored.

No monthly reset, inactivity deletion job, TTL, operator history or login form is implemented. The currently published Site is owner-private and uses the hosting platform's access boundary. GitHub publication alone does not change hosting or make the app public.

## Step 1 — Install locally

Use Node.js 24 (the test suite uses Node's built-in SQLite module) and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
```

A clean clone defaults to the portable execution profile. Development does not require production database credentials. Do not copy the ignored `.sites-runtime`, `.wrangler`, backups or environment files into source control.

## Step 2 — Prepare a local database

Build to generate the local Worker configuration:

```sh
pnpm build
```

For a new local database, apply the initial schema once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_red_northstar.sql
```

This affects local development only. Do not replay the migration against an existing database. Future schema changes require new migrations; never rewrite already-applied migrations.

## Step 3 — Start the app

```sh
pnpm dev
```

Open the local URL printed in the terminal. For a built local Worker, use `pnpm start`. The local database is separate from the live shop database.

## Step 4 — Check the code

```sh
pnpm typecheck
pnpm test
pnpm build
```

Tests execute the API handlers against an in-memory SQLite database through a small D1 adapter. They cover quantity validation, durable writes, repeated requests, stale-version conflicts, backup validation, storage failures and all-731-product atomic restores. They do not replace an end-to-end browser test or Cloudflare runtime test.

## Step 5 — Count and back up

1. Open the app online and wait for cloud stock to load.
2. Search for a product and use the counter or quantity input.
3. Wait for **All changes saved** before closing the page.
4. Choose **Download backup** after completing a counting session.
5. Keep the JSON file outside the browser, such as in your files or your own drive.

The automatic local snapshot contains confirmed stock only. A pending change is not a confirmed cloud backup. When cloud access fails, the app preserves the visible count and disables new edits; it never substitutes an error with a zero-stock snapshot.

Local storage is specific to a browser and site origin. Clearing site data, changing phones/domains or using private browsing can remove or hide it. It does not sync between phones. This app does not include an offline service worker; loading the app shell from scratch may still require internet even when a local snapshot exists.

## Step 6 — Restore a backup

1. Connect to the internet and wait for any pending saves.
2. Click **Restore** and select a Stockroom JSON backup.
3. Review its timestamp and the current/backup quantities.
4. Confirm the restore. A pre-restore download is initiated, and a local pre-restore copy is attempted.
5. The server applies the restore in one SQL statement only if all previewed stock versions still match.
6. If a conflict occurs, close the preview, refresh and review again. Do not assume an interrupted request failed; refresh the cloud stock before retrying.

The file must contain exactly this catalogue's 731 unique product IDs and matching names, valid whole quantities, a timestamp and the supported format version. Backup file versions are never copied into the live database: the current database versions are used for concurrency checks.

## Step 7 — Publish and maintain

The current hosting workflow is ChatGPT Sites with a Cloudflare Worker and D1 binding named `DB`. `.openai/hosting.json` identifies the existing deployment. Use the Sites source-sync/build/deploy workflow to update that Site while preserving the existing database and audience.

Running this project on your own Cloudflare account requires your own Worker deployment configuration and D1 binding/migration setup. The Sites manifest is not a ready-made standalone Cloudflare deployment command. Before making any independently hosted copy public, configure appropriate access controls for the write endpoints.

No provider is promised to offer perpetual uptime or unlimited retention. Downloaded backups protect the count independently of hosting access. This app does not issue artificial keep-alive requests while closed.

## Project map

| Path | Purpose |
| --- | --- |
| `app/page.tsx` | Search, counter state, save queue and local snapshot integration |
| `components/backup-panel.tsx` | Download, file validation and restore preview |
| `app/api/stock/route.ts` | Read stock and update one product |
| `app/api/stock/restore/route.ts` | Atomic, version-checked restore |
| `lib/backup.ts` | Backup schema, validation and storage helpers |
| `data/products.json` | Stable product IDs and exact names |
| `db/schema.ts` | Drizzle schema for the stock table |
| `drizzle/` | Immutable database migrations |
| `tests/` | Backend and recovery tests |
| `docs/ARCHITECTURE.md` | Technology and data-flow notes |

Live quantities and downloaded backups are not part of Git. Keep the source repository private because it contains the shop's product catalogue. Never commit access tokens, environment secrets or service-account keys.
