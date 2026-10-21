# Manual Vercel deployment with Cloudflare D1

This version is Next.js on Vercel, with D1 accessed over HTTPS from server API routes. You can configure it in your mobile browser; Chrome's Desktop site option may make the dashboards easier to use. No local terminal is required for the dashboard steps below.

## 1. Preserve any existing counts

Open the original stock counter and download its JSON backup before changing where you count. Keep the original app available until you have verified the new one. A GitHub checkout contains product names, not the saved live quantities. The Sites-managed D1 binding is not automatically accessible through your personal Cloudflare account.

## 2. Create or identify your D1 database

In your own Cloudflare account, open **Storage & databases > D1 SQL database** and create `stockroom` (or select an existing compatible database). Copy its **Database ID** and the owning **Account ID**.

For a **new, empty database only**, open its **Console** and execute the exact initial schema below, also available in `drizzle/0000_red_northstar.sql`:

```sql
CREATE TABLE stock (
  product_id integer PRIMARY KEY NOT NULL,
  quantity integer DEFAULT 0 NOT NULL,
  version integer DEFAULT 0 NOT NULL,
  mutation_id text DEFAULT '' NOT NULL
);
```

Do not drop, recreate, truncate or reset an existing stock table. If reusing a database, confirm its columns match the schema. No product inserts are needed: names are bundled in the app, and missing stock rows start at zero. Redeploying does not reset saved counts. This repository does not run migrations automatically.

## 3. Create a restricted API token

In Cloudflare's API Tokens settings, create a custom token with **Account > D1 > Edit** (D1 write permission), limited to the account containing this database. Do not use a Global API Key or grant unrelated permissions. The account scope can include other D1 databases in that account; it is not a database-specific restriction.

Copy the token directly into Vercel as a secret. Do not put it in GitHub, a screenshot, a browser-side variable or chat. If you set an expiry, replace the token before it expires to keep counting available.

## 4. Import the repo in Vercel

Import `Somil680/stockroom`, branch `main`.

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root directory | Repository root (`./`) |
| Node.js | 24.x |
| Build command | `pnpm build` (provided by `vercel.json`) |
| Install command | Default auto-detection using the committed pnpm lockfile |
| Output directory | Framework default; do not set `dist` |

Add these exact environment variables for **Production** before deploying:

```dotenv
CLOUDFLARE_ACCOUNT_ID=your_32_character_account_id
CLOUDFLARE_D1_DATABASE_ID=your_database_uuid
CLOUDFLARE_API_TOKEN=your_private_d1_api_token
```

Use `.env.example` as the template. All three are server-side. Store the token as Secret/Sensitive where the dashboard offers that option. Preview and local development should use their own test database/token, not production credentials. No Firebase variables, `DATABASE_URL`, `DB` string or `NEXT_PUBLIC_` variables are needed.

Deploy after setting the variables. After changing values later, redeploy so the new deployment receives them. The build can succeed without credentials, but counting remains unavailable until credentials, schema and database access are valid.

## 5. Protect access before using real data

The original Sites privacy boundary does not carry over. This app has no custom operator login. **On an unprotected public deployment, anyone who reaches the API can read and change stock.** Origin checks do not prevent direct API requests. Use appropriate hosting access protection for the operators before importing real counts; if platform login is unsuitable, a separate access mechanism must be added before public use. Keeping the URL unlisted is not authentication.

Vercel Hobby is restricted to personal, non-commercial use. This shop deployment is business use; moving the database to D1 does not change that restriction. No subscription or deployment has been created by this code update. Choose a suitable hosting plan before operational use.

## 6. Verify before moving counting

1. With a separate test database, confirm all 731 products load and start at zero.
2. On a chosen test product, test +, minus and direct numeric entry. Wait for “All changes saved”, reload, then verify the same value from another phone.
3. Download a backup and verify that restore preview matches its counts; test restore only against test data.
4. After production setup and access protection, import the original downloaded JSON backup through the app's Restore preview. Check totals before confirming. Keep the original database unchanged.
5. Confirm counts on a second device and download a fresh JSON backup before retiring the previous URL.

If “Cloud is unavailable” appears, check all three variables, correct account/database ownership, token permission/expiry, schema existence, and Cloudflare API or D1 quota errors. Never fix this by resetting the database. The app retains the last confirmed local snapshot and disables new counting when cloud stock cannot be loaded.

## Limits and verification scope

This is a small-usage REST integration. Cloudflare recommends a Worker API for application traffic because the general Cloudflare API limits apply to D1 REST calls. HTTP round trips can add latency; rate limits return an error instead of discarding counts. Local snapshots are browser- and domain-specific; download JSON backups after counting.

The supplied automated checks use in-memory SQLite behind a simulated HTTP endpoint plus a real Next.js production build. A successful build is not a live D1 connectivity test. Real Cloudflare credentials and Vercel deployment validation remain the account owner's manual steps.

Official references:
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://developers.cloudflare.com/d1/tutorials/build-an-api-to-access-d1/
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/plans/hobby
