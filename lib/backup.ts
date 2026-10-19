import catalogue from "@/data/products.json";

export type Product = { id: number; name: string; quantity: number; version: number };
export type StockBackup = { format: "stockroom-backup"; schemaVersion: 1; savedAt: string; products: Product[] };
export const SNAPSHOT_KEY = "stockroom:last-confirmed:v1";
export const BEFORE_RESTORE_KEY = "stockroom:before-restore:v1";
export const MAX_BACKUP_BYTES = 2_000_000;
const names = new Map(catalogue.map(p => [p.id, p.name]));

export function validateProducts(value: unknown): Product[] {
  if (!Array.isArray(value) || value.length !== catalogue.length) throw new Error(`Backup must contain all ${catalogue.length} products.`);
  const seen = new Set<number>();
  const rows = value.map(p => {
    if (!p || typeof p !== "object" || !Number.isSafeInteger(p.id) || seen.has(p.id) || names.get(p.id) !== p.name) throw new Error("Product IDs or names do not match this shop’s catalogue.");
    if (!Number.isSafeInteger(p.quantity) || p.quantity < 0 || p.quantity > 999999) throw new Error("Quantities must be whole numbers from 0 to 999999.");
    if (!Number.isSafeInteger(p.version) || p.version < 0) throw new Error("Invalid stock version in backup.");
    seen.add(p.id);
    return { id: p.id, name: p.name, quantity: p.quantity, version: p.version };
  });
  return rows.sort((a, b) => a.id - b.id);
}

export function validateBackup(value: unknown): StockBackup {
  if (!value || typeof value !== "object") throw new Error("This is not a Stockroom backup.");
  const b = value as Partial<StockBackup>;
  if (b.format !== "stockroom-backup" || b.schemaVersion !== 1) throw new Error("Unsupported backup format. Choose a Stockroom JSON backup.");
  if (typeof b.savedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(b.savedAt) || !Number.isFinite(Date.parse(b.savedAt))) throw new Error("Backup date is missing or invalid.");
  return { format: "stockroom-backup", schemaVersion: 1, savedAt: b.savedAt, products: validateProducts(b.products) };
}

export function parseBackup(text: string): StockBackup {
  if (text.length > MAX_BACKUP_BYTES) throw new Error("Backup is too large (maximum 2 MB).");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("This file does not contain valid JSON."); }
  return validateBackup(value);
}

export function createBackup(products: Product[], savedAt = new Date().toISOString()): StockBackup {
  return validateBackup({ format: "stockroom-backup", schemaVersion: 1, savedAt, products });
}

// Never turn a read error, invalid file or missing snapshot into a zero-stock backup.
export function readSnapshot(storage: Pick<Storage, "getItem">, key = SNAPSHOT_KEY): StockBackup | null {
  const text = storage.getItem(key);
  return text === null ? null : parseBackup(text);
}

export function writeSnapshot(storage: Pick<Storage, "setItem">, snapshot: StockBackup, key = SNAPSHOT_KEY): void {
  storage.setItem(key, JSON.stringify(validateBackup(snapshot)));
}

export function mergeConfirmed(previous: Product[], incoming: Product[]): Product[] {
  const old = new Map(previous.map(p => [p.id, p]));
  return incoming.map(p => { const before = old.get(p.id); return before && before.version > p.version ? before : p; });
}

export function backupChanges(backup: StockBackup, current: Product[]) {
  const live = new Map(current.map(p => [p.id, p]));
  return backup.products.filter(p => p.quantity !== live.get(p.id)?.quantity).map(p => ({ ...p, previous: live.get(p.id)?.quantity ?? 0 }));
}
