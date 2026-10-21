import "server-only";
import { createD1Client } from "./d1-http";

// Read secrets lazily: builds need no live database or Cloudflare credentials.
export function getDb() {
  return createD1Client({
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
}
