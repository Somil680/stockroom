# Architecture and database

## Technology

The UI uses React 19 and TypeScript with Next.js App Router. Vercel runs the Node.js API routes. They call Cloudflare D1's HTTPS query endpoint from the server through `db/d1-http.ts`. Styling, product IDs, quantities, optimistic version checks and backup format are unchanged.

The three Cloudflare environment variables are read lazily in `db/index.ts`, which is guarded by `server-only`. The API token never enters the browser bundle. The transport uses parameterized queries, disables caching and redirects, times out each query after 10 seconds, and does not automatically replay failed writes. Existing route-level IDs and version checks make user-initiated retries safe. API errors yield 503 rather than a successful empty or zero-stock response.

Drizzle still describes the schema; request handlers execute SQL through the REST adapter. Builds do not run migrations. Cloudflare's REST API has global API rate limits in addition to D1 quotas; a Worker API is the preferred future path if usage grows. Legacy Sites/Vinext tooling remains in the repo but is not used by the Vercel build.

## Data model

Product names and stable IDs are in `data/products.json`. They are joined in application code with the `stock` table. A missing stock row represents quantity 0 and version 0. The first write creates the row. Opening or redeploying the app does not reset existing quantities.

| stock column | SQL type | Meaning |
| --- | --- | --- |
| product_id | INTEGER PRIMARY KEY | Catalogue product ID |
| quantity | INTEGER NOT NULL DEFAULT 0 | Current whole-piece count |
| version | INTEGER NOT NULL DEFAULT 0 | Monotonically increasing concurrency version |
| mutation_id | TEXT NOT NULL DEFAULT '' | Identifier of the latest write, used to recognize retries |

There is no count history, operator identity, timestamp column or data-expiry setting. Snapshot timestamps describe when a client confirmed a copy; they are not database update times.

## API

| Method and endpoint | Behaviour |
| --- | --- |
| GET /api/stock | Full catalogue with saved quantities and versions; no cache |
| PATCH /api/stock | Validated single-product save using an expected version and request ID |
| POST /api/stock/restore | Validate a full backup and previewed state, then restore changed quantities atomically |

PATCH returns 409 instead of silently overwriting an unexpected version. Same-request retries do not increment stock or its version twice. Restore uses `json_each` with one JSON parameter to avoid a query per product. One stale previewed version prevents all restore writes. An already-applied restore is recognized by comparing the resulting quantities.

## Browser state and backup

- Optimistic screen state lets taps respond immediately; per-product requests are serialized.
- Confirmed state is separate from pending edits. Only server-confirmed values enter the snapshot.
- Older read responses cannot replace newer confirmed versions.
- Local storage key `stockroom:last-confirmed:v1` stores the last confirmed snapshot.
- Key `stockroom:before-restore:v1` retains the prior snapshot when browser storage permits.
- A local copy newer than the returned cloud versions triggers read-only recovery guidance instead of silently discarding the copy.
- JSON exports use `format: stockroom-backup`, `schemaVersion: 1`, `savedAt` and all products with IDs, names, quantities and versions.
- A failed load preserves cached data. Cached data never automatically overwrites the cloud.
- Restore is disabled while saves are pending; the operator sees a comparison and confirms before mutation.

Local storage failure is shown to the operator and does not prevent cloud saving or an in-memory JSON download. Local storage is a convenience copy, not a guarantee of offline access or permanent retention.

## Access and deployment

The original hosted Site uses owner-private Sites access. That boundary does not transfer to Vercel. This application has no custom login, and Origin checks are not authentication. Protect the Vercel deployment before connecting real shop data. Without protection, anyone able to reach its APIs can read or change quantities. See `VERCEL.md`.

Source control contains the catalogue, not live counts. A new D1 database is empty until quantities are saved or explicitly restored from a downloaded backup. Changing domains creates a separate browser-local storage area; export the original backup before moving. Never reset or recreate the original database to migrate hosting.
