import "server-only";
import { createD1Client } from "./d1-http";

let client: ReturnType<typeof createD1Client> | undefined;

// Read secrets lazily: builds need no live database or Cloudflare credentials.
export function getDb() {
  return client ??= createD1Client({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
}

export { databaseFailure } from "./d1-http";
