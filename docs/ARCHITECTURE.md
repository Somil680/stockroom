# Architecture and database

## Technology

The UI uses React 19 and TypeScript. Vinext provides Next.js App Router-compatible pages and API routes, with Vite builds. Styling is primarily custom CSS with Tailwind imported; icons use Lucide React. The server runs in Cloudflare Workers. D1 provides SQLite-compatible durable storage. Drizzle defines the schema and generates migrations; request handlers execute parameterized SQL directly through the D1 binding.

Node.js is a development/build/test dependency, not a separate production Express server. Starter dependencies that are installed but not used by the app are not part of the implemented feature set.

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

The live deployment currently relies on owner-private Sites access. There is no custom authentication form. Origin checks help reject browser cross-site writes but are not authentication. Do not expose these write endpoints on an independently public server without adding an access boundary.

The source repository contains the catalogue and code, not the live stock database. Updating GitHub does not by itself deploy the app. Production migrations are applied by Sites; local database migration commands operate on a separate local database.
