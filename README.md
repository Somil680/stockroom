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

## Deploy manually on Vercel

This GitHub version now uses **Next.js on Vercel + Cloudflare D1 over the server-side REST API**. The existing Sites-hosted app remains a separate deployment. Follow [the mobile-friendly deployment guide](docs/VERCEL.md).

Copy [`.env.example`](.env.example) to `.env.local` for local development, or enter its three keys in Vercel. Real credentials are intentionally absent. No `NEXT_PUBLIC_` keys are needed.

## Local development and checks

Use Node.js 24 and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
# Fill .env.local with credentials for a separate test D1 database.
pnpm dev
```

Create the schema in that test database before counting. Local development uses the configured remote D1 database; it is not a local SQLite instance. Never point local or Preview environments at shop production data.

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Builds require no credentials and do not initialize or modify any database. Tests exercise real route SQL against in-memory SQLite through the HTTP adapter with a simulated Cloudflare response. They cover all 731 products, saves, retries, conflicts, full atomic restores, transport errors and invalid configuration. They do not replace a real D1/Vercel smoke test.

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

## Deployment and maintenance

See [docs/VERCEL.md](docs/VERCEL.md) for D1 creation, schema setup, API token permissions, Vercel settings, access protection and transferring an existing backup. The legacy Sites/Vinext build sources are retained for reference but are not used by `pnpm build` in this version. Do not use this GitHub branch to redeploy the original Site without restoring its binding-based server adapter and build scripts.

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
| `db/d1-http.ts` | Server-side D1 REST transport |
| `db/schema.ts` | Drizzle schema for the stock table |
| `drizzle/` | Immutable database migrations |
| `tests/` | Backend and recovery tests |
| `docs/ARCHITECTURE.md` | Technology and data-flow notes |

Live quantities and downloaded backups are not part of Git. The source repository is public and includes the product catalogue. Never commit access tokens, environment secrets or service-account keys.
