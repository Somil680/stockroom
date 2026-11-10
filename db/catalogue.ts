import products from "@/data/products.json";
import type { createD1Client } from "./d1-http";
type Database = ReturnType<typeof createD1Client>;
export const CUSTOM_PRODUCT_START = 1_000_000;
export const normalizeName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/gu, " ");
export const nameKey = (name: string) => normalizeName(name).toLowerCase();
export const originalNameKeys = new Set(products.map(p => nameKey(p.name)));
const initialization = new WeakMap<Database, Promise<unknown>>();
export async function ensureProductTable(db: Database) {
  let ready = initialization.get(db);
  if (!ready) {
    // Additive initialization: never recreate or reset the existing stock table.
    ready = db.prepare(`CREATE TABLE IF NOT EXISTS custom_products (
      id INTEGER PRIMARY KEY CHECK (id >= 1000000),
      name TEXT NOT NULL,
      name_key TEXT NOT NULL UNIQUE,
      creation_id TEXT NOT NULL UNIQUE
    )`).all().catch(error => { initialization.delete(db); throw error; });
    initialization.set(db, ready);
  }
  await ready;
}
export async function readCatalogue(db: Database) {
  await ensureProductTable(db);
  const { results } = await db.prepare("SELECT id, name FROM custom_products ORDER BY id").all<{ id: number; name: string }>();
  return [...products, ...results];
}
